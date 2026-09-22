/**
 * app.js — Git Contribution Tool v2
 *
 * 4 features:
 *  1. Contribution Calendar (Feature 1)
 *  2. Random Contributions (Feature 2)
 *  3. Contribution Art (Feature 3)
 *  4. Remove Contributions (Feature 4)
 *
 * Source of truth: real Git history (never JSON data files).
 */

'use strict';

/* ===================================================
   STATE
   =================================================== */
const state = {
  repoPath:      '',
  isConnected:   false,
  calendarYear:  new Date().getFullYear(),
  artGrid:       [],   // 7 rows × N cols, each cell = commit count (number)
  artCols:       12,
  artBrushValue: 1,
  artIsPainting: false,
  rmPreviewData: null  // data from /api/contributions/remove preview
};

/* ===================================================
   UTILITIES
   =================================================== */
function qs(sel, ctx = document) { return ctx.querySelector(sel); }
function qsa(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function show(el) { el && el.classList.remove('hidden'); }
function hide(el) { el && el.classList.add('hidden'); }
function toggle(el, visible) { visible ? show(el) : hide(el); }

function setLoading(visible, text = 'Working…') {
  const overlay = qs('#loading-overlay');
  const ltext   = qs('#loading-text');
  if (ltext) ltext.textContent = text;
  toggle(overlay, visible);
}

function toast(msg, type = 'info', duration = 4000) {
  const container = qs('#toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    ${type === 'success' ? '<polyline points="20 6 9 17 4 12"/>'
      : type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
      : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
  </svg><span>${escHtml(String(msg))}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toast-out 0.2s ease forwards';
    setTimeout(() => t.remove(), 200);
  }, duration);
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(d) {
  if (!d) return '—';
  return d; // already YYYY-MM-DD from git
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || json.message || `HTTP ${res.status}`);
  }
  return json;
}

/* ===================================================
   NAVIGATION
   =================================================== */
const NAV_TABS = ['contribution', 'random', 'art', 'remove'];

function switchTab(tabId) {
  NAV_TABS.forEach(id => {
    const tab = qs(`#tab-${id}`);
    const btn = qs(`#nav-${id}`);
    // Use the .active CSS class for tab visibility (not .hidden)
    if (tab) tab.classList.toggle('active', id === tabId);
    if (btn) btn.classList.toggle('active', id === tabId);
  });
  if (tabId === 'contribution') refreshCalendar();
  if (tabId === 'art') {
    // Ensure art grid is built when switching to art tab
    if (!qs('#art-grid')?.children.length) buildArtGrid();
  }
}

function initNav() {
  NAV_TABS.forEach(id => {
    const btn = qs(`#nav-${id}`);
    if (btn) btn.addEventListener('click', () => switchTab(id));
  });
}

/* ===================================================
   REPOSITORY CONNECTION
   =================================================== */
function initRepository() {
  const btnConnect  = qs('#btn-connect-repo');
  const pathInput   = qs('#repo-path-input');
  const pathDisplay = qs('#repo-path-text');
  const statusBadge = qs('#repo-status-badge');

  btnConnect.addEventListener('click', async () => {
    const path = pathInput.value.trim();
    if (!path) { toast('Please enter a repository path.', 'error'); return; }

    setLoading(true, 'Validating repository…');
    try {
      const data = await apiFetch('/api/repository/validate', {
        method: 'POST',
        body: JSON.stringify({ path })
      });

      if (data.isValid) {
        // Save settings
        await apiFetch('/api/repository/settings', {
          method: 'POST',
          body: JSON.stringify({ repositoryPath: path })
        });

        state.repoPath    = path;
        state.isConnected = true;

        pathDisplay.textContent = path;
        pathDisplay.parentElement.title = path;

        statusBadge.textContent = '✓ Connected';
        statusBadge.className   = 'status-badge valid';

        enableButtons(true);
        toast('Repository connected!', 'success');
        refreshCalendar();
        updateGitStatusBar();
      } else {
        statusBadge.textContent = `✗ ${data.message || 'Invalid'}`;
        statusBadge.className   = 'status-badge invalid';
        state.isConnected = false;
        enableButtons(false);
        toast(data.message || 'Invalid repository path.', 'error');
      }
    } catch (err) {
      toast(err.message, 'error');
      statusBadge.textContent = '✗ Error';
      statusBadge.className   = 'status-badge invalid';
    } finally {
      setLoading(false);
    }
  });

  // Allow Enter key in path input
  pathInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') btnConnect.click();
  });

  // Push button listeners
  const btnSidebarPush = qs('#btn-sidebar-push');
  if (btnSidebarPush) btnSidebarPush.addEventListener('click', handlePush);

  const btnHeaderPush = qs('#btn-header-push');
  if (btnHeaderPush) btnHeaderPush.addEventListener('click', handlePush);

  const btnStripPush = qs('#btn-strip-push');
  if (btnStripPush) btnStripPush.addEventListener('click', handlePush);

  // Load saved repo on startup
  loadSavedRepo();
}

async function loadSavedRepo() {
  try {
    const data = await apiFetch('/api/repository/settings');
    state.settings = data.settings;
    const saved = data.settings?.repositoryPath;
    if (saved) {
      qs('#repo-path-input').value = saved;
      // Auto-validate
      qs('#btn-connect-repo').click();
    }
    // Populate dynamic author inputs
    if (data.settings?.authorName) {
      const randName = qs('#rand-author-name');
      if (randName && !randName.value) randName.value = data.settings.authorName;
      const artName = qs('#art-author-name');
      if (artName && !artName.value) artName.value = data.settings.authorName;
    }
    if (data.settings?.authorEmail) {
      const randEmail = qs('#rand-author-email');
      if (randEmail && !randEmail.value) randEmail.value = data.settings.authorEmail;
      const artEmail = qs('#art-author-email');
      if (artEmail && !artEmail.value) artEmail.value = data.settings.authorEmail;
    }
  } catch (e) {
    // No saved settings yet — that's fine
  }
}

function enableButtons(enabled) {
  const btns = [
    qs('#btn-refresh-calendar'),
    qs('#btn-add-random'),
    qs('#btn-add-random-push'),
    qs('#btn-art-preview'),
    qs('#btn-rm-preview'),
    qs('#btn-sidebar-push'),
    qs('#btn-header-push'),
    qs('#btn-strip-push')
  ];
  btns.forEach(b => { if (b) b.disabled = !enabled; });
}

let isPushing = false;

async function handlePush(force = false) {
  if (isPushing || !state.isConnected) return;
  isPushing = true;

  const sidebarBtn = qs('#btn-sidebar-push');
  const headerBtn  = qs('#btn-header-push');
  const stripBtn   = qs('#btn-strip-push');

  const setBtnLoading = (btn) => {
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite"></span> ${force ? 'Force Pushing…' : 'Pushing…'}`;
  };

  setBtnLoading(sidebarBtn);
  setBtnLoading(headerBtn);
  if (stripBtn) {
    stripBtn.disabled = true;
    stripBtn.textContent = force ? 'Force Pushing…' : 'Pushing…';
  }
  setLoading(true, force ? 'Force-pushing to remote…' : 'Pushing commits to remote…');

  try {
    const data = await apiFetch('/api/git/push', {
      method: 'POST',
      body: JSON.stringify({ force })
    });

    toast(data.output || 'Commits pushed to remote successfully!', 'success');
    await updateGitStatusBar();
    if (state.calendarYear) {
      refreshCalendar();
    }
  } catch (err) {
    if (err.message && err.message.includes('non-fast-forward')) {
      const confirmForce = confirm(
        'Remote history has diverged because past commits were removed.\n\n' +
        'To overwrite GitHub with your cleaned commits, a Force Push is required.\n\n' +
        'Would you like to Force Push now?'
      );
      if (confirmForce) {
        isPushing = false;
        return handlePush(true);
      }
    }
    toast(`Push failed: ${err.message}`, 'error');
  } finally {
    isPushing = false;
    setLoading(false);
    if (sidebarBtn) {
      sidebarBtn.disabled = false;
      sidebarBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/></svg>
        <span id="sidebar-push-text">Push to Remote</span>
        <span id="sidebar-push-badge" class="push-count-badge hidden">0</span>`;
    }
    if (headerBtn) {
      headerBtn.disabled = false;
      headerBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/></svg>
        <span id="header-push-text">Push to Remote</span>
        <span id="header-push-badge" class="push-count-badge hidden">0</span>`;
    }
    if (stripBtn) {
      stripBtn.disabled = false;
      stripBtn.textContent = 'Push';
    }
    updateGitStatusBar();
  }
}

async function updateGitStatusBar() {
  if (!state.isConnected) return;
  try {
    const data = await apiFetch('/api/repository/status');
    const git  = data.status?.git;
    if (!git) return;

    qs('#git-branch-display').textContent   = git.branch || '—';
    qs('#git-commits-display').textContent  = `${git.totalCommits ?? 0} commits`;
    qs('#chip-branch-text').textContent     = git.branch || '—';
    qs('#chip-status-text').textContent     = git.isClean ? 'Clean' : 'Modified';
    qs('#chip-total-commits').textContent   = `${git.totalCommits ?? 0} total commits`;
    show(qs('#repo-info-strip'));

    // Handle unpushed commits display - ALWAYS show commit count that will be published
    const unpushed = git.unpushedCommits || 0;
    state.unpushedCommits = unpushed;

    const sidebarBadge = qs('#sidebar-push-badge');
    const headerBadge  = qs('#header-push-badge');
    const unpushedNotice = qs('#unpushed-notice');
    const unpushedDot = qs('#unpushed-dot-icon');
    const unpushedNoticeText = qs('#unpushed-notice-text');
    const chipUnpushed = qs('#chip-unpushed');
    const footerUnpushed = qs('#git-unpushed-footer');

    // Update Random estimate unpushed count
    const randEstUnpushed = qs('#rand-est-unpushed');
    if (randEstUnpushed) {
      randEstUnpushed.textContent = `${unpushed} to publish`;
    }

    if (unpushed > 0) {
      if (sidebarBadge) {
        sidebarBadge.textContent = `${unpushed} to publish`;
        sidebarBadge.classList.remove('zero');
        show(sidebarBadge);
      }
      if (headerBadge) {
        headerBadge.textContent = `${unpushed} to publish`;
        headerBadge.classList.remove('zero');
        show(headerBadge);
      }
      if (unpushedNotice) {
        show(unpushedNotice);
        if (unpushedDot) unpushedDot.className = 'unpushed-dot';
        if (unpushedNoticeText) unpushedNoticeText.textContent = `⚠️ ${unpushed} commit${unpushed !== 1 ? 's' : ''} to publish`;
      }
      if (chipUnpushed) {
        show(chipUnpushed);
        const chipTxt = qs('#chip-unpushed-text');
        if (chipTxt) chipTxt.textContent = `${unpushed} to publish`;
        const stripBtn = qs('#btn-strip-push');
        if (stripBtn) show(stripBtn);
      }
      if (footerUnpushed) {
        show(footerUnpushed);
        footerUnpushed.textContent = `· ${unpushed} to publish`;
      }
    } else {
      if (sidebarBadge) {
        sidebarBadge.textContent = '0 to publish';
        sidebarBadge.classList.add('zero');
        show(sidebarBadge);
      }
      if (headerBadge) {
        headerBadge.textContent = '0 to publish';
        headerBadge.classList.add('zero');
        show(headerBadge);
      }
      if (unpushedNotice) {
        show(unpushedNotice);
        if (unpushedDot) unpushedDot.className = 'unpushed-dot clean';
        if (unpushedNoticeText) unpushedNoticeText.textContent = '✓ 0 commits to publish (up to date)';
      }
      if (chipUnpushed) {
        show(chipUnpushed);
        const chipTxt = qs('#chip-unpushed-text');
        if (chipTxt) chipTxt.textContent = '0 to publish (up to date)';
        const stripBtn = qs('#btn-strip-push');
        if (stripBtn) hide(stripBtn);
      }
      if (footerUnpushed) {
        show(footerUnpushed);
        footerUnpushed.textContent = '· 0 to publish';
      }
    }
  } catch (e) {
    // silently ignore status errors
  }
}

/* ===================================================
   FEATURE 1 — CONTRIBUTION CALENDAR
   =================================================== */
function initCalendar() {
  // Build year select
  const sel = qs('#cal-year-select');
  const currentYear = new Date().getFullYear();
  for (let y = currentYear + 1; y >= currentYear - 4; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    sel.appendChild(opt);
  }
  state.calendarYear = currentYear;

  sel.addEventListener('change', () => {
    state.calendarYear = parseInt(sel.value, 10);
    refreshCalendar();
  });

  qs('#btn-refresh-calendar').addEventListener('click', refreshCalendar);
}

async function refreshCalendar() {
  if (!state.isConnected) return;

  const calContent = qs('#calendar-content');
  const calEmpty   = qs('#calendar-empty-state');

  hide(calEmpty);
  setLoading(true, 'Loading calendar…');

  try {
    const data = await apiFetch(`/api/contributions?year=${state.calendarYear}`);
    const cal  = data.calendar;

    hide(calEmpty);
    show(calContent);
    renderCalendar(cal);
    updateGitStatusBar();
  } catch (err) {
    toast(`Calendar error: ${err.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

function renderCalendar(cal) {
  // Stats
  qs('#stat-total').innerHTML  = `<strong>${cal.totalContributions}</strong> contributions in ${cal.year}`;
  qs('#stat-active').innerHTML = `<strong>${cal.totalActiveDays}</strong> active days`;
  qs('#stat-max').innerHTML    = `Max <strong>${cal.maxDayCount}</strong>/day`;

  // Build the entire calendar inside #calendar-content
  const container = qs('#calendar-content');
  // Remove old grid wrapper if present
  const oldWrap = container.querySelector('.cal-inner-wrap');
  if (oldWrap) oldWrap.remove();

  const tooltip = qs('#cal-tooltip');

  // Create wrapper
  const wrap = document.createElement('div');
  wrap.className = 'cal-inner-wrap';
  wrap.style.cssText = 'overflow-x:auto; padding-bottom:8px; margin-top:12px;';

  // Inner flex container: weekday labels col + weeks area
  const inner = document.createElement('div');
  inner.style.cssText = 'display:flex; align-items:flex-start; gap:4px; min-width:max-content;';

  // -- Weekday labels column --
  const wdCol = document.createElement('div');
  wdCol.style.cssText = 'display:flex; flex-direction:column; gap:3px; padding-top:18px;';
  ['', 'Mon', '', 'Wed', '', 'Fri', ''].forEach(label => {
    const span = document.createElement('span');
    span.style.cssText = `font-size:0.6rem; color:var(--text-muted); height:13px; line-height:13px; text-align:right; padding-right:4px; min-width:28px;`;
    span.textContent = label;
    wdCol.appendChild(span);
  });
  inner.appendChild(wdCol);

  // -- Weeks area --
  const weeksArea = document.createElement('div');
  weeksArea.style.cssText = 'display:flex; flex-direction:column; gap:0;';

  // Month labels row
  const monthsRow = document.createElement('div');
  monthsRow.style.cssText = 'display:flex; gap:3px; margin-bottom:4px; height:14px;';

  let lastMonth = -1;
  let weekIdx = 0;
  cal.weeks.forEach(week => {
    const firstInRange = week.find(d => d.isWithinRange);
    if (firstInRange && firstInRange.month !== lastMonth) {
      const label = document.createElement('span');
      label.style.cssText = `font-size:0.65rem; color:var(--text-muted); white-space:nowrap; min-width:${16 * 3}px;`;
      label.textContent = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
        new Date(firstInRange.date)
      );
      monthsRow.appendChild(label);
      lastMonth = firstInRange.month;
    } else {
      // Filler span to maintain alignment
      const filler = document.createElement('span');
      filler.style.cssText = 'display:inline-block; min-width:16px;';
      // Don't append filler — month label approach is positional, not per-week
    }
    weekIdx++;
  });
  weeksArea.appendChild(monthsRow);

  // Weeks grid container
  const weeksGrid = document.createElement('div');
  weeksGrid.style.cssText = 'display:flex; gap:3px;';

  cal.weeks.forEach(week => {
    const col = document.createElement('div');
    col.style.cssText = 'display:flex; flex-direction:column; gap:3px;';

    week.forEach(day => {
      const cell = document.createElement('div');
      const lvl = day.isWithinRange ? day.intensity : 0;
      cell.style.cssText = `width:13px;height:13px;border-radius:2px;background:var(--c${lvl});flex-shrink:0;cursor:default;transition:opacity 0.1s;${!day.isWithinRange ? 'opacity:0.25;' : ''}`;

      cell.addEventListener('mouseenter', e => {
        if (day.isWithinRange) {
          tooltip.textContent = day.count > 0
            ? `${day.date}: ${day.count} commit${day.count !== 1 ? 's' : ''}`
            : `${day.date}: No contributions`;
          show(tooltip);
          positionTooltip(e, tooltip);
        }
      });
      cell.addEventListener('mousemove', e => positionTooltip(e, tooltip));
      cell.addEventListener('mouseleave', () => hide(tooltip));

      col.appendChild(cell);
    });

    weeksGrid.appendChild(col);
  });

  weeksArea.appendChild(weeksGrid);
  inner.appendChild(weeksArea);
  wrap.appendChild(inner);
  container.appendChild(wrap);

  // Auto-scroll to show current date area
  setTimeout(() => {
    const scrollEl = wrap;
    const today = new Date();
    // Each week column is 13+3=16px wide, figure out which week index is 'now'
    // We scan the weeks to find a week containing today
    let targetWeekIdx = 0;
    const todayStr2 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    cal.weeks.forEach((week, wi) => {
      week.forEach(day => {
        if (day.date === todayStr2) targetWeekIdx = wi;
      });
    });
    // Scroll to put the current week in view (minus some padding)
    const scrollTarget = Math.max(0, (targetWeekIdx - 8) * 16);
    scrollEl.scrollLeft = scrollTarget;
  }, 50);
}

function positionTooltip(e, tooltip) {
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  let x = e.clientX + 12;
  let y = e.clientY - th - 8;
  if (x + tw > window.innerWidth - 8) x = e.clientX - tw - 12;
  if (y < 4) y = e.clientY + 12;
  tooltip.style.left = `${x}px`;
  tooltip.style.top  = `${y}px`;
}

/* ===================================================
   FEATURE 2 — RANDOM CONTRIBUTIONS
   =================================================== */
function initRandom() {
  const today       = todayStr();
  const weekFromNow = addDays(today, 6);

  const startDateInput = qs('#rand-start-date');
  const endDateInput   = qs('#rand-end-date');
  const minInput       = qs('#rand-min');
  const maxInput       = qs('#rand-max');

  startDateInput.value = today;
  endDateInput.value   = weekFromNow;

  const updateRandomEstimate = () => {
    const s = startDateInput.value;
    const e = endDateInput.value;
    const min = parseInt(minInput.value, 10) || 1;
    const max = parseInt(maxInput.value, 10) || 1;

    const estDays = qs('#rand-est-days');
    const estCommits = qs('#rand-est-commits');
    const estUnpushed = qs('#rand-est-unpushed');

    if (estUnpushed) {
      estUnpushed.textContent = `${state.unpushedCommits || 0} to publish`;
    }

    if (!s || !e) return;
    const d1 = new Date(s);
    const d2 = new Date(e);
    const diffTime = d2.getTime() - d1.getTime();
    const days = Math.round(diffTime / (1000 * 3600 * 24)) + 1;

    if (days <= 0) {
      if (estDays) estDays.textContent = 'Invalid range';
      if (estCommits) estCommits.textContent = '0 commits';
      return;
    }

    if (estDays) estDays.textContent = `${days} day${days !== 1 ? 's' : ''}`;
    const minTot = days * Math.min(min, max);
    const maxTot = days * Math.max(min, max);
    if (estCommits) {
      if (minTot === maxTot) {
        estCommits.textContent = `${minTot} commit${minTot !== 1 ? 's' : ''}`;
      } else {
        estCommits.textContent = `~${minTot} – ${maxTot} commits`;
      }
    }
  };

  startDateInput.addEventListener('input', updateRandomEstimate);
  endDateInput.addEventListener('input', updateRandomEstimate);
  minInput.addEventListener('input', updateRandomEstimate);
  maxInput.addEventListener('input', updateRandomEstimate);

  updateRandomEstimate();

  qs('#btn-add-random').addEventListener('click', () => handleRandom(false));
  qs('#btn-add-random-push').addEventListener('click', () => handleRandom(true));
}

async function handleRandom(pushAfter = false) {
  const startDate  = qs('#rand-start-date').value;
  const endDate    = qs('#rand-end-date').value;
  const minCommits = parseInt(qs('#rand-min').value, 10) || 1;
  const maxCommits = parseInt(qs('#rand-max').value, 10) || 5;
  const message    = qs('#rand-message').value.trim() || 'Git learning commit';
  const authorName = qs('#rand-author-name')?.value?.trim();
  const authorEmail = qs('#rand-author-email')?.value?.trim();

  if (!startDate || !endDate) { toast('Please select start and end dates.', 'error'); return; }
  if (minCommits < 1 || maxCommits < minCommits) {
    toast('Min must be ≥ 1 and Max must be ≥ Min.', 'error'); return;
  }
  if (maxCommits > 20) { toast('Max commits per day cannot exceed 20.', 'error'); return; }

  setLoading(true, pushAfter ? 'Creating commits & pushing…' : 'Creating commits…');
  const resultPanel = qs('#random-result');
  hide(resultPanel);

  try {
    const data = await apiFetch('/api/contributions/random', {
      method: 'POST',
      body: JSON.stringify({
        startDate,
        endDate,
        minCommits,
        maxCommits,
        message,
        authorName,
        authorEmail
      })
    });

    // Optionally push
    let pushMsg = '';
    if (pushAfter) {
      try {
        setLoading(true, 'Pushing to remote…');
        await apiFetch('/api/git/push', { method: 'POST', body: JSON.stringify({}) });
        pushMsg = '<br/><span style="color:var(--accent)">✓ Pushed to remote successfully.</span>';
      } catch (pushErr) {
        pushMsg = `<br/><span style="color:var(--warning)">⚠ Commits created but push failed: ${escHtml(pushErr.message)}</span>`;
      }
    }

    resultPanel.className = 'result-panel success';
    resultPanel.innerHTML = `
      <strong>✓ ${data.createdCount} commits created</strong> across ${data.dayCount} day(s) (${startDate} → ${endDate}).${pushMsg}<br/>
      <div class="commit-list">
        ${(data.commits || []).slice(0, 30).map(c => `
          <div class="commit-item">
            <span class="commit-hash">${escHtml(c.shortHash || '')}</span>
            <span class="commit-date">${escHtml((c.date || '').substring(0, 10))}</span>
            <span class="commit-msg">${escHtml(c.message || '')}</span>
          </div>`).join('')}
        ${data.commits?.length > 30 ? `<div style="color:var(--text-muted);padding-top:4px">…and ${data.commits.length - 30} more</div>` : ''}
      </div>`;
    show(resultPanel);

    const successMsg = pushAfter
      ? `Created ${data.createdCount} commits & pushed!`
      : `Created ${data.createdCount} commits!`;
    toast(successMsg, 'success');

    updateGitStatusBar();
    if (state.calendarYear) {
      apiFetch(`/api/contributions?year=${state.calendarYear}`)
        .then(res => { if (res.calendar) renderCalendar(res.calendar); })
        .catch(() => {});
    }
  } catch (err) {
    resultPanel.className   = 'result-panel error';
    resultPanel.textContent = `Error: ${err.message}`;
    show(resultPanel);
    toast(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ===================================================
   FEATURE 3 — CONTRIBUTION ART
   =================================================== */
function initArt() {
  const today = todayStr();
  qs('#art-start-date').value = today;

  buildArtGrid();

  // Intensity picker
  qsa('.intensity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.intensity-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.artBrushValue = parseInt(btn.dataset.value, 10);
    });
  });

  // Toolbar
  qs('#btn-art-clear').addEventListener('click', clearArtGrid);
  qs('#btn-art-resize').addEventListener('click', () => {
    const cols = parseInt(qs('#art-cols').value, 10);
    if (cols >= 1 && cols <= 52) {
      state.artCols = cols;
      buildArtGrid();
    }
  });

  qs('#btn-art-preview').addEventListener('click', handleArtPreview);
  qs('#btn-art-apply').addEventListener('click', handleArtApply);
}

function buildArtGrid() {
  const ROWS = 7;
  const cols = state.artCols;

  // Preserve existing values where possible
  const oldGrid = state.artGrid;
  state.artGrid = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: cols }, (_, c) => oldGrid[r]?.[c] ?? 0)
  );

  renderArtGrid();
}

function renderArtGrid() {
  const gridEl = qs('#art-grid');
  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = `repeat(${state.artCols}, var(--cell-size))`;

  // Set grid-auto-flow: column; grid-template-rows: repeat(7, ...)
  // already in CSS: grid-auto-flow: column; grid-template-rows: repeat(7, var(--cell-size))

  for (let c = 0; c < state.artCols; c++) {
    for (let r = 0; r < 7; r++) {
      const val  = state.artGrid[r][c];
      const cell = document.createElement('div');
      cell.className = `art-cell l${countToLevel(val)}`;
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.title = `${val} commit${val !== 1 ? 's' : ''}`;

      cell.addEventListener('mousedown', e => {
        state.artIsPainting = true;
        paintCell(r, c);
        e.preventDefault();
      });

      cell.addEventListener('mouseenter', () => {
        if (state.artIsPainting) paintCell(r, c);
      });

      gridEl.appendChild(cell);
    }
  }

  document.addEventListener('mouseup', () => { state.artIsPainting = false; }, { once: false });
}

function paintCell(r, c) {
  state.artGrid[r][c] = state.artBrushValue;
  const gridEl = qs('#art-grid');
  // Find the cell: grid is col-major, so cell index = c*7 + r
  const idx  = c * 7 + r;
  const cell = gridEl.children[idx];
  if (cell) {
    const val = state.artBrushValue;
    cell.className = `art-cell l${countToLevel(val)}`;
    cell.title = `${val} commit${val !== 1 ? 's' : ''}`;
    cell.dataset.value = val;
  }
}

function clearArtGrid() {
  state.artGrid = Array.from({ length: 7 }, () => Array(state.artCols).fill(0));
  renderArtGrid();
  hide(qs('#art-preview-panel'));
  hide(qs('#art-result-panel'));
  hide(qs('#btn-art-apply'));
}

function countToLevel(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

async function handleArtPreview() {
  const startDate = qs('#art-start-date').value;
  if (!startDate) { toast('Please select a start date.', 'error'); return; }

  const previewPanel = qs('#art-preview-panel');

  try {
    // Send grid + startDate to server to get schedule
    const data = await apiFetch('/api/designs/generate-schedule', {
      method: 'POST',
      body: JSON.stringify({ grid: state.artGrid, startDate })
    });

    const sched = data.schedule;
    const totalCommits = sched.reduce((s, d) => s + d.count, 0);
    const activeDays   = sched.filter(d => d.count > 0).length;

    previewPanel.className = 'result-panel';
    previewPanel.innerHTML = `
      <strong>Schedule Preview</strong><br/>
      📅 Date range: <code>${sched[0]?.date ?? startDate}</code> → <code>${sched[sched.length-1]?.date ?? '?'}</code><br/>
      📆 Total days: ${sched.length} &nbsp;|&nbsp; Active days: ${activeDays}<br/>
      🔢 Total commits to create: <strong>${totalCommits}</strong><br/>
      <div class="commit-list" style="margin-top:8px">
        ${sched.filter(d => d.count > 0).slice(0, 20).map(d =>
          `<div class="commit-item">
            <span class="commit-date">${escHtml(d.date)}</span>
            <span class="commit-msg">${d.count} commit${d.count !== 1 ? 's' : ''}</span>
           </div>`
        ).join('')}
        ${activeDays > 20 ? `<div style="color:var(--text-muted)">…and ${activeDays - 20} more days</div>` : ''}
      </div>`;
    show(previewPanel);

    if (totalCommits > 0) {
      show(qs('#btn-art-apply'));
      qs('#btn-art-apply').disabled = false;
    }
  } catch (err) {
    previewPanel.className   = 'result-panel error';
    previewPanel.textContent = `Error: ${err.message}`;
    show(previewPanel);
    toast(err.message, 'error');
  }
}

async function handleArtApply() {
  const startDate   = qs('#art-start-date').value;
  const message     = qs('#art-message').value.trim() || 'Git pattern commit';
  const authorName  = qs('#art-author-name')?.value?.trim();
  const authorEmail = qs('#art-author-email')?.value?.trim();
  if (!startDate) { toast('Please select a start date.', 'error'); return; }

  setLoading(true, 'Creating art commits…');
  const resultPanel = qs('#art-result-panel');
  hide(resultPanel);

  try {
    const data = await apiFetch('/api/designs/apply-locally', {
      method: 'POST',
      body: JSON.stringify({
        grid: state.artGrid,
        startDate,
        message,
        authorName,
        authorEmail,
        name: 'Contribution Art'
      })
    });

    resultPanel.className = 'result-panel success';
    resultPanel.innerHTML = `
      <strong>✓ ${data.createdCount} real commits created</strong><br/>
      ${data.message}<br/>
      <div class="commit-list">
        ${(data.commits || []).slice(0, 20).map(c =>
          `<div class="commit-item">
            <span class="commit-hash">${escHtml(c.shortHash || '')}</span>
            <span class="commit-date">${escHtml((c.date || '').substring(0,10))}</span>
            <span class="commit-msg">${escHtml(c.message || '')}</span>
           </div>`
        ).join('')}
        ${data.commits?.length > 20 ? `<div style="color:var(--text-muted)">…and ${data.commits.length - 20} more</div>` : ''}
      </div>`;
    show(resultPanel);
    toast(`Art applied! ${data.createdCount} commits created.`, 'success');
  } catch (err) {
    resultPanel.className   = 'result-panel error';
    resultPanel.textContent = `Error: ${err.message}`;
    show(resultPanel);
    toast(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ===================================================
   FEATURE 4 — REMOVE CONTRIBUTIONS
   =================================================== */
function initRemove() {
  const today = todayStr();
  const weekAgo = addDays(today, -6);

  qs('#rm-start-date').value = weekAgo;
  qs('#rm-end-date').value   = today;

  qs('#btn-rm-preview').addEventListener('click', handleRemovePreview);
  qs('#btn-rm-cancel').addEventListener('click', () => {
    hide(qs('#rm-confirm-panel'));
    state.rmPreviewData = null;
  });
  qs('#btn-rm-confirm').addEventListener('click', handleRemoveConfirm);
}

async function handleRemovePreview() {
  const startDate = qs('#rm-start-date').value;
  const endDate   = qs('#rm-end-date').value;

  if (!startDate || !endDate) { toast('Please select start and end dates.', 'error'); return; }
  if (startDate > endDate)    { toast('Start date must be before end date.', 'error'); return; }

  setLoading(true, 'Checking affected commits…');
  hide(qs('#rm-confirm-panel'));

  try {
    const data = await apiFetch('/api/contributions/remove', {
      method: 'POST',
      body: JSON.stringify({ startDate, endDate, confirmed: false })
    });

    state.rmPreviewData = { startDate, endDate, ...data };

    const btnConfirm = qs('#btn-rm-confirm');
    const emptyCount = data.emptyCount || 0;
    const codeCount  = data.codeCount || 0;

    if (emptyCount > 0) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        Yes, Remove ${emptyCount} Empty Commit${emptyCount !== 1 ? 's' : ''}
      `;
    } else {
      btnConfirm.disabled = true;
      btnConfirm.textContent = 'No Empty Commits to Remove';
    }

    const details = qs('#rm-confirm-details');
    details.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">Date range</span>
        <span class="detail-value">${escHtml(startDate)} → ${escHtml(endDate)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Empty contribution commits</span>
        <span class="detail-value" style="color: ${emptyCount > 0 ? 'var(--danger)' : 'var(--text-muted)'}">
          <strong>${emptyCount}</strong> commit${emptyCount !== 1 ? 's' : ''} (removable)
        </span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Real code commits</span>
        <span class="detail-value" style="color: var(--accent, #3b82f6)">
          🛡️ <strong>${codeCount}</strong> commit${codeCount !== 1 ? 's' : ''} (protected & preserved)
        </span>
      </div>
      ${data.hasRemote ? `
      <div class="detail-row">
        <span class="detail-label">⚠ Remote repository</span>
        <span class="detail-value" style="color:var(--warning)">Requires manual force-push after rewrite</span>
      </div>` : ''}

      ${emptyCount > 0 ? `
      <div style="margin-top:14px;margin-bottom:6px;font-size:0.82rem;font-weight:600;color:var(--text-muted);">
        Empty commits to be removed (${emptyCount}):
      </div>
      <div class="commit-list" style="max-height:160px;overflow-y:auto;">
        ${(data.emptyCommits || []).slice(0, 50).map(c => `
          <div class="commit-item">
            <span class="commit-hash">${escHtml(c.shortHash)}</span>
            <span class="commit-date">${escHtml(c.dateOnly)}</span>
            <span class="commit-msg">${escHtml(c.subject)} <small style="color:var(--text-muted)">(${escHtml(c.authorName)})</small></span>
          </div>
        `).join('')}
        ${emptyCount > 50 ? `<div style="color:var(--text-muted);padding-top:4px">…and ${emptyCount - 50} more empty commits</div>` : ''}
      </div>` : `
      <div style="margin-top:12px;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:4px;font-size:0.82rem;color:var(--text-muted);">
        No empty contribution commits found in this date range.
      </div>`}

      ${codeCount > 0 ? `
      <div style="margin-top:12px;padding:8px 12px;background:rgba(59,130,246,0.08);border-left:3px solid var(--accent,#3b82f6);border-radius:4px;font-size:0.8rem;color:var(--text-main);">
        🛡️ <strong>Safety Guarantee:</strong> All ${codeCount} code commit(s) in this range contain real project files and will <strong>NOT</strong> be touched.
      </div>` : ''}
    `;

    show(qs('#rm-confirm-panel'));
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function handleRemoveConfirm() {
  if (!state.rmPreviewData) return;
  const { startDate, endDate, emptyCommits } = state.rmPreviewData;
  const hashes = (emptyCommits || []).map(c => c.hash);

  if (hashes.length === 0) {
    toast('No empty commits to remove.', 'info');
    return;
  }

  setLoading(true, `Safely removing ${hashes.length} empty commits…`);
  hide(qs('#rm-confirm-panel'));
  const resultPanel = qs('#rm-result');
  hide(resultPanel);

  try {
    const data = await apiFetch('/api/contributions/remove', {
      method: 'POST',
      body: JSON.stringify({ startDate, endDate, confirmed: true, hashes })
    });

    resultPanel.className = 'result-panel success';
    const currentBranch = state.gitStatus?.git?.branch || 'v2';
    resultPanel.innerHTML = `
      <strong>✓ History Safely Rewritten</strong><br/>
      Removed: <strong>${data.removedCount}</strong> empty contribution commit(s)<br/>
      Kept & Preserved: <strong>${data.keptCount}</strong> commit(s)<br/>
      <br/>
      <span style="color:var(--text-muted)">Old HEAD: <code>${escHtml(data.originalHead?.substring(0,7) ?? '?')}</code></span><br/>
      <span style="color:var(--text-muted)">New HEAD: <code>${escHtml(data.newHead?.substring(0,7) ?? 'empty')}</code></span><br/>
      <br/>
      <span style="color:var(--accent)">✓ All real project code was 100% preserved.</span><br/>
      <span style="color:var(--warning-dim)">⚠ If you already pushed to remote, force-push your updated branch: <code>git push origin ${escHtml(currentBranch)} --force</code></span>
      <div style="margin-top:10px;">
        <button id="btn-force-push-result" class="btn btn-warning btn-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/></svg>
          Force Push to Remote Now
        </button>
      </div>`;
    show(resultPanel);

    qs('#btn-force-push-result')?.addEventListener('click', () => handlePush(true));

    state.rmPreviewData = null;
    toast(`Safely removed ${data.removedCount} empty commit(s)!`, 'success');
    updateGitStatusBar();
    refreshCalendar();
  } catch (err) {
    resultPanel.className   = 'result-panel error';
    resultPanel.textContent = `Error: ${err.message}`;
    show(resultPanel);
    toast(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ===================================================
   DATE HELPERS
   =================================================== */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ===================================================
   KEYBOARD SHORTCUTS
   =================================================== */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    switch (e.key) {
      case '1': switchTab('contribution'); e.preventDefault(); break;
      case '2': switchTab('random');       e.preventDefault(); break;
      case '3': switchTab('art');          e.preventDefault(); break;
      case '4': switchTab('remove');       e.preventDefault(); break;
    }
  }
});

// Art grid: stop painting on mouseup anywhere
document.addEventListener('mouseup', () => { state.artIsPainting = false; });

/* ===================================================
   INIT
   =================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initRepository();
  initCalendar();
  initRandom();
  initArt();
  initRemove();
});
