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
  repoPath:       '',
  isConnected:    false,
  calendarYear:   new Date().getFullYear(),
  artGrid:        [],   // 7 rows × N cols: new commits to create
  artTargetGrid:  [],   // 7 rows × N cols: target painted values
  artDays:        [],   // N cols array of day objects
  artMonthLabels: [],
  artCols:        12,
  artBrushValue:  1,
  artBrushMode:   'target',   // 'target' | 'additive'
  artViewMode:    'combined', // 'combined' | 'art' | 'existing'
  artIsPainting:  false,
  rmPreviewData:  null
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
const NAV_TABS = ['contribution', 'random', 'art', 'remove', 'settings'];

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
    syncArtGridFromRemote();
  }
  if (tabId === 'settings' && state.settings) {
    populateAuthorAndSettingsInputs(state.settings);
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

function populateAuthorAndSettingsInputs(settings) {
  if (!settings) return;
  const authorName = settings.authorName || '';
  const authorEmail = settings.authorEmail || '';
  const ghUser = settings.githubUsername || settings.detectedGithubUser || '';

  // Random Tab
  const randName = qs('#rand-author-name');
  if (randName) randName.value = authorName;
  const randEmail = qs('#rand-author-email');
  if (randEmail) randEmail.value = authorEmail;
  const randMsg = qs('#rand-message');
  if (randMsg && !randMsg.value && settings.defaultCommitMessage) randMsg.value = settings.defaultCommitMessage;

  // Art Tab
  const artName = qs('#art-author-name');
  if (artName) artName.value = authorName;
  const artEmail = qs('#art-author-email');
  if (artEmail) artEmail.value = authorEmail;
  const artMsg = qs('#art-message');
  if (artMsg && !artMsg.value && settings.defaultCommitMessage) artMsg.value = settings.defaultCommitMessage;
  const artGhUser = qs('#art-github-username');
  if (artGhUser && !artGhUser.value && ghUser) artGhUser.value = ghUser;

  // Settings Tab
  const setAuthor = qs('#settings-author-name');
  if (setAuthor) setAuthor.value = authorName;
  const setEmail = qs('#settings-author-email');
  if (setEmail) setEmail.value = authorEmail;
  const setGhUser = qs('#settings-github-username');
  if (setGhUser) setGhUser.value = ghUser;
  const setBranch = qs('#settings-default-branch');
  if (setBranch) setBranch.value = settings.defaultBranch || 'main';
  const setRemote = qs('#settings-remote-name');
  if (setRemote) setRemote.value = settings.remoteName || 'origin';
  const setMsg = qs('#settings-default-message');
  if (setMsg) setMsg.value = settings.defaultCommitMessage || 'Git contribution commit';
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
    populateAuthorAndSettingsInputs(data.settings);
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
  wdCol.style.cssText = 'display:flex; flex-direction:column; gap:3px; padding-top:22px;';
  ['', 'Mon', '', 'Wed', '', 'Fri', ''].forEach(label => {
    const span = document.createElement('span');
    span.style.cssText = `font-size:0.6rem; color:var(--text-muted); height:13px; line-height:13px; text-align:right; padding-right:6px; min-width:28px;`;
    span.textContent = label;
    wdCol.appendChild(span);
  });
  inner.appendChild(wdCol);

  // -- Weeks area --
  const weeksArea = document.createElement('div');
  weeksArea.style.cssText = 'display:flex; flex-direction:column; gap:0;';

  // Month labels row (positioned directly above matching week columns)
  const monthsRow = document.createElement('div');
  monthsRow.style.cssText = 'position:relative; height:18px; margin-bottom:4px;';

  const monthLabels = cal.monthLabels || [];
  let lastPlacedX = -50;

  monthLabels.forEach(m => {
    const leftPx = m.weekIndex * 16;
    // Avoid overlap by maintaining at least 28px separation
    if (leftPx - lastPlacedX >= 28 && m.weekIndex < (cal.weeks?.length || 53)) {
      const label = document.createElement('span');
      label.style.cssText = `position:absolute; left:${leftPx}px; font-size:0.68rem; font-weight:500; color:var(--text-muted); white-space:nowrap; pointer-events:none;`;
      label.textContent = m.monthName;
      monthsRow.appendChild(label);
      lastPlacedX = leftPx;
    }
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

  // Default start date (Sunday 11 weeks ago)
  const startDateInput = qs('#art-start-date');
  if (startDateInput && !startDateInput.value) {
    const d = new Date();
    d.setDate(d.getDate() - (state.artCols - 1) * 7);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    startDateInput.value = d.toISOString().substring(0, 10);
  }

  // Pre-fill GitHub username if available
  const artGhUser = qs('#art-github-username');
  if (artGhUser && !artGhUser.value && (state.settings?.githubUsername || state.settings?.detectedGithubUser)) {
    artGhUser.value = state.settings.githubUsername || state.settings.detectedGithubUser;
  }

  // Intensity picker
  qsa('.intensity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.intensity-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.artBrushValue = parseInt(btn.dataset.value, 10);
    });
  });

  // Brush Mode (Target Level vs Additive)
  const btnBrushTarget = qs('#btn-brush-target');
  const btnBrushAdditive = qs('#btn-brush-additive');
  if (btnBrushTarget && btnBrushAdditive) {
    btnBrushTarget.addEventListener('click', () => {
      state.artBrushMode = 'target';
      btnBrushTarget.classList.add('active');
      btnBrushAdditive.classList.remove('active');
      recalculateArtGrid();
      renderArtGrid();
      toast('Brush mode: Target Level (Smart Match) — auto-accounts for existing commits.', 'info');
    });
    btnBrushAdditive.addEventListener('click', () => {
      state.artBrushMode = 'additive';
      btnBrushAdditive.classList.add('active');
      btnBrushTarget.classList.remove('active');
      recalculateArtGrid();
      renderArtGrid();
      toast('Brush mode: Additive (+N) — directly adds painted commits.', 'info');
    });
  }

  // View Mode (Combined vs Art vs Existing)
  const viewBtns = [
    { id: 'btn-view-combined', mode: 'combined' },
    { id: 'btn-view-art', mode: 'art' },
    { id: 'btn-view-existing', mode: 'existing' }
  ];
  viewBtns.forEach(({ id, mode }) => {
    const b = qs(`#${id}`);
    if (b) {
      b.addEventListener('click', () => {
        viewBtns.forEach(vb => qs(`#${vb.id}`)?.classList.remove('active'));
        b.classList.add('active');
        state.artViewMode = mode;
        renderArtGrid();
      });
    }
  });

  // Fetch / Sync button
  const btnFetchSync = qs('#btn-art-fetch-sync');
  if (btnFetchSync) btnFetchSync.addEventListener('click', syncArtGridFromRemote);

  // Source selector change
  const sourceSel = qs('#art-source-select');
  if (sourceSel) sourceSel.addEventListener('change', syncArtGridFromRemote);

  // Start date change
  if (startDateInput) startDateInput.addEventListener('change', syncArtGridFromRemote);

  // Toolbar actions
  qs('#btn-art-clear').addEventListener('click', clearArtGrid);
  qs('#btn-art-resize').addEventListener('click', () => {
    const cols = parseInt(qs('#art-cols').value, 10);
    if (cols >= 1 && cols <= 52) {
      state.artCols = cols;
      syncArtGridFromRemote();
    }
  });

  qs('#btn-art-preview').addEventListener('click', handleArtPreview);
  qs('#btn-art-apply').addEventListener('click', handleArtApply);

  // Initial load
  syncArtGridFromRemote();
}

async function syncArtGridFromRemote() {
  const startDateInput = qs('#art-start-date');
  let startDate = startDateInput?.value;
  if (!startDate) {
    const d = new Date();
    d.setDate(d.getDate() - (state.artCols - 1) * 7);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    startDate = d.toISOString().substring(0, 10);
    if (startDateInput) startDateInput.value = startDate;
  }

  const username = qs('#art-github-username')?.value?.trim() || state.settings?.githubUsername || state.settings?.detectedGithubUser || '';
  const source = qs('#art-source-select')?.value || 'github';
  const weeks = state.artCols;

  const statusEl = qs('#art-sync-status');
  if (statusEl) {
    statusEl.innerHTML = `<span style="color:var(--text-muted)">⏳ Fetching ${source === 'github' ? (username ? `@${username}` : 'GitHub') : source} activity…</span>`;
  }

  try {
    const url = `/api/contributions/art-grid?startDate=${startDate}&weeks=${weeks}&source=${source}&username=${encodeURIComponent(username)}`;
    const data = await apiFetch(url);

    state.artDays = data.weeks || [];
    state.artMonthLabels = data.monthLabels || [];

    if (statusEl) {
      const activeCount = state.artDays.flat().filter(d => d.existingCount > 0).length;
      const totalEx = state.artDays.flat().reduce((s, d) => s + (d.existingCount || 0), 0);
      statusEl.innerHTML = `<span style="color:var(--accent)">✓ ${source === 'github' ? `@${data.githubUsername || 'GitHub'}` : 'Git'}: ${totalEx} existing contributions (${activeCount} active days)</span>`;
    }

    recalculateArtGrid();
    renderArtMonthLabels();
    renderArtGrid();
  } catch (err) {
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--danger)">✗ ${err.message}</span>`;
    }
    buildFallbackArtDays(startDate, weeks);
    renderArtMonthLabels();
    renderArtGrid();
  }
}

function buildFallbackArtDays(startDateStr, weeks) {
  const baseDate = new Date(startDateStr + 'T00:00:00');
  const startSun = new Date(baseDate);
  const day = startSun.getDay();
  startSun.setDate(startSun.getDate() - day);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  state.artDays = [];
  state.artMonthLabels = [];
  const recordedMonths = new Set();
  let curr = new Date(startSun);

  for (let c = 0; c < weeks; c++) {
    const colDays = [];
    for (let r = 0; r < 7; r++) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;

      colDays.push({
        date: dateKey,
        col: c,
        row: r,
        dayOfWeek: r,
        existingCount: 0,
        existingLevel: 0,
        githubCount: 0,
        localCount: 0,
        tooltip: `No contributions on ${dateKey}`
      });

      if (r === 0 || curr.getDate() === 1) {
        const mKey = `${curr.getFullYear()}-${curr.getMonth()}`;
        if (!recordedMonths.has(mKey)) {
          state.artMonthLabels.push({ colIndex: c, label: monthNames[curr.getMonth()] });
          recordedMonths.add(mKey);
        }
      }

      curr.setDate(curr.getDate() + 1);
    }
    state.artDays.push(colDays);
  }
}

function recalculateArtGrid() {
  const ROWS = 7;
  const cols = state.artCols;

  if (!state.artGrid || state.artGrid.length !== ROWS || state.artGrid[0]?.length !== cols) {
    const oldGrid = state.artGrid || [];
    state.artGrid = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: cols }, (_, c) => oldGrid[r]?.[c] ?? 0)
    );
  }

  if (!state.artTargetGrid || state.artTargetGrid.length !== ROWS || state.artTargetGrid[0]?.length !== cols) {
    const oldTarget = state.artTargetGrid || [];
    state.artTargetGrid = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: cols }, (_, c) => oldTarget[r]?.[c] ?? null)
    );
  }

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < ROWS; r++) {
      const dayObj = state.artDays[c]?.[r];
      const targetVal = state.artTargetGrid[r]?.[c];
      if (targetVal !== null && targetVal !== undefined) {
        const existing = dayObj?.existingCount || 0;
        let targetCommits = 0;
        if (targetVal === 1) targetCommits = 1;
        else if (targetVal === 2) targetCommits = 2;
        else if (targetVal === 3) targetCommits = 4;
        else if (targetVal === 5) targetCommits = 5;
        else if (targetVal === 7) targetCommits = 7;

        state.artGrid[r][c] = Math.max(0, targetCommits - existing);
      }
    }
  }
}

function renderArtMonthLabels() {
  const mount = qs('#art-month-labels');
  if (!mount) return;
  mount.innerHTML = '';

  const labels = state.artMonthLabels || [];
  let lastX = -50;
  labels.forEach(m => {
    const x = m.colIndex * 16; // 13px cell + 3px gap = 16px
    if (x - lastX >= 32) {
      const span = document.createElement('span');
      span.className = 'art-month-label';
      span.style.left = `${x}px`;
      span.textContent = m.label;
      mount.appendChild(span);
      lastX = x;
    }
  });
}

function renderArtGrid() {
  const gridEl = qs('#art-grid');
  if (!gridEl) return;
  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = `repeat(${state.artCols}, var(--cell-size))`;

  const ROWS = 7;
  const cols = state.artCols;

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < ROWS; r++) {
      const dayObj = state.artDays[c]?.[r];
      const cell = document.createElement('div');
      cell.dataset.row = r;
      cell.dataset.col = c;

      const existing = dayObj?.existingCount || 0;
      const artCommits = state.artGrid[r]?.[c] || 0;
      const total = existing + artCommits;

      let displayLevel = 0;
      if (state.artViewMode === 'combined') {
        displayLevel = countToLevel(total);
      } else if (state.artViewMode === 'art') {
        displayLevel = countToLevel(artCommits);
      } else {
        displayLevel = dayObj?.existingLevel ?? countToLevel(existing);
      }

      cell.className = `art-cell l${displayLevel}${existing > 0 ? ' has-existing' : ''}${artCommits > 0 ? ' has-art' : ''}`;

      cell.addEventListener('mousedown', e => {
        state.artIsPainting = true;
        paintCell(r, c);
        showArtTooltip(cell, r, c);
        e.preventDefault();
      });

      cell.addEventListener('mouseenter', () => {
        if (state.artIsPainting) paintCell(r, c);
        showArtTooltip(cell, r, c);
      });

      cell.addEventListener('mouseleave', () => {
        hide(qs('#cal-tooltip'));
      });

      gridEl.appendChild(cell);
    }
  }
}

function paintCell(r, c) {
  const dayObj = state.artDays[c]?.[r];
  const brushVal = state.artBrushValue;

  if (state.artBrushMode === 'target') {
    state.artTargetGrid[r][c] = brushVal;
    const existing = dayObj?.existingCount || 0;
    let targetCommits = 0;
    if (brushVal === 1) targetCommits = 1;
    else if (brushVal === 2) targetCommits = 2;
    else if (brushVal === 3) targetCommits = 4;
    else if (brushVal === 5) targetCommits = 5;
    else if (brushVal === 7) targetCommits = 7;

    state.artGrid[r][c] = Math.max(0, targetCommits - existing);
  } else {
    state.artTargetGrid[r][c] = null;
    state.artGrid[r][c] = brushVal;
  }

  updateCellDOM(r, c);
}

function updateCellDOM(r, c) {
  const gridEl = qs('#art-grid');
  if (!gridEl) return;
  const idx = c * 7 + r;
  const cell = gridEl.children[idx];
  if (!cell) return;

  const dayObj = state.artDays[c]?.[r];
  const existing = dayObj?.existingCount || 0;
  const artCommits = state.artGrid[r]?.[c] || 0;
  const total = existing + artCommits;

  let displayLevel = 0;
  if (state.artViewMode === 'combined') {
    displayLevel = countToLevel(total);
  } else if (state.artViewMode === 'art') {
    displayLevel = countToLevel(artCommits);
  } else {
    displayLevel = dayObj?.existingLevel ?? countToLevel(existing);
  }

  cell.className = `art-cell l${displayLevel}${existing > 0 ? ' has-existing' : ''}${artCommits > 0 ? ' has-art' : ''}`;
}

function showArtTooltip(cell, r, c) {
  const tooltip = qs('#cal-tooltip');
  if (!tooltip) return;

  const dayObj = state.artDays[c]?.[r];
  const date = dayObj?.date || '';
  const existing = dayObj?.existingCount || 0;
  const art = state.artGrid[r]?.[c] || 0;
  const total = existing + art;
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][r] || '';
  const sourceName = qs('#art-source-select')?.value === 'github' ? 'GitHub Account' : qs('#art-source-select')?.value === 'both' ? 'GitHub + Local' : 'Local Git';

  tooltip.innerHTML = `
    <div style="font-weight:600; margin-bottom:3px; color:var(--text);">${dayName}, ${date}</div>
    <div style="color:var(--text-muted); font-size:0.75rem; line-height:1.5;">
      <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#38bdf8; margin-right:4px;"></span>
      ${sourceName}: <strong style="color:var(--text);">${existing}</strong> contribution${existing !== 1 ? 's' : ''} (Level ${dayObj?.existingLevel ?? countToLevel(existing)})<br/>
      🎨 Art to add: <strong style="color:var(--accent);">${art > 0 ? '+' : ''}${art}</strong> commit${art !== 1 ? 's' : ''}<br/>
      ✨ Final after push: <strong style="color:#22c55e;">${total}</strong> contribution${total !== 1 ? 's' : ''} (Level ${countToLevel(total)})
    </div>
  `;

  show(tooltip);
  const rect = cell.getBoundingClientRect();
  tooltip.style.left = `${Math.max(10, rect.left + window.scrollX - 60)}px`;
  tooltip.style.top = `${rect.top + window.scrollY - 75}px`;
}

function clearArtGrid() {
  const ROWS = 7;
  const cols = state.artCols;
  state.artGrid = Array.from({ length: ROWS }, () => Array(cols).fill(0));
  state.artTargetGrid = Array.from({ length: ROWS }, () => Array(cols).fill(null));
  renderArtGrid();
  hide(qs('#art-preview-panel'));
  hide(qs('#art-result-panel'));
  hide(qs('#btn-art-apply'));
  toast('Art additions cleared. Existing contributions remain visible.', 'info');
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
    const data = await apiFetch('/api/designs/generate-schedule', {
      method: 'POST',
      body: JSON.stringify({ grid: state.artGrid, startDate })
    });

    const sched = data.schedule;
    const totalNewCommits = sched.reduce((s, d) => s + d.count, 0);
    const activeArtDays = sched.filter(d => d.count > 0).length;

    let totalExisting = 0;
    state.artDays.flat().forEach(d => { totalExisting += d.existingCount || 0; });

    previewPanel.className = 'result-panel';
    previewPanel.innerHTML = `
      <strong>Schedule Preview (Aligned to GitHub Weeks)</strong><br/>
      📅 Date range: <code>${sched[0]?.date ?? startDate}</code> → <code>${sched[sched.length-1]?.date ?? '?'}</code><br/>
      📆 Total days in view: ${sched.length} &nbsp;|&nbsp; Days with new art: ${activeArtDays}<br/>
      🏢 Existing contributions in range: <strong>${totalExisting}</strong><br/>
      ➕ New art commits to create: <strong style="color:var(--accent)">${totalNewCommits}</strong><br/>
      ✨ Final total on GitHub: <strong style="color:#22c55e">${totalExisting + totalNewCommits}</strong><br/>
      <div class="commit-list" style="margin-top:8px">
        ${sched.filter(d => d.count > 0).slice(0, 25).map(d => {
          const dayObj = state.artDays[d.gridCol]?.[d.gridRow];
          const exist = dayObj?.existingCount || 0;
          return `<div class="commit-item">
            <span class="commit-date">${escHtml(d.date)}</span>
            <span class="commit-msg">+${d.count} commit${d.count !== 1 ? 's' : ''} (existing: ${exist} → final: ${exist + d.count})</span>
          </div>`;
        }).join('')}
        ${activeArtDays > 25 ? `<div style="color:var(--text-muted)">…and ${activeArtDays - 25} more days</div>` : ''}
      </div>`;
    show(previewPanel);

    if (totalNewCommits > 0) {
      show(qs('#btn-art-apply'));
      qs('#btn-art-apply').disabled = false;
    } else {
      hide(qs('#btn-art-apply'));
      toast('The current artwork requires 0 new commits (existing commits already satisfy the design!).', 'info');
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

  setLoading(true, 'Creating art commits in local repository…');
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
      <strong>✓ ${data.createdCount} real commits created locally</strong><br/>
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
    toast(`Art applied! ${data.createdCount} commits created. Push them to remote to update GitHub!`, 'success');

    // Re-sync with status bar & update local grid
    updateGitStatusBar();
    refreshCalendar();
    syncArtGridFromRemote();
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
      case '5': switchTab('settings');     e.preventDefault(); break;
    }
  }
});

// Art grid: stop painting on mouseup anywhere
document.addEventListener('mouseup', () => { state.artIsPainting = false; });

/* ===================================================
   SETTINGS TAB
   =================================================== */
function initSettings() {
  const btnSave = qs('#btn-save-settings');
  const btnDetect = qs('#btn-detect-git-author');
  const hint = qs('#detected-git-author-hint');

  if (btnDetect) {
    btnDetect.addEventListener('click', async () => {
      try {
        setLoading(true, 'Reading Git config…');
        const data = await apiFetch('/api/repository/git-author');
        if (data.gitUser?.name || data.gitUser?.email) {
          if (data.gitUser.name) qs('#settings-author-name').value = data.gitUser.name;
          if (data.gitUser.email) qs('#settings-author-email').value = data.gitUser.email;
          if (hint) hint.textContent = `✓ Detected: ${data.gitUser.name || 'No name'} <${data.gitUser.email || 'No email'}>`;
          toast('Detected author identity from local Git configuration!', 'success');
        } else {
          if (hint) hint.textContent = 'No user.name or user.email found in Git config.';
          toast('No author configured in local or global Git config.', 'info');
        }
      } catch (err) {
        toast('Failed to read Git config: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const authorName = qs('#settings-author-name')?.value?.trim() || '';
      const authorEmail = qs('#settings-author-email')?.value?.trim() || '';
      const githubUsername = qs('#settings-github-username')?.value?.trim() || '';
      const defaultBranch = qs('#settings-default-branch')?.value?.trim() || '';
      const remoteName = qs('#settings-remote-name')?.value?.trim() || '';
      const defaultCommitMessage = qs('#settings-default-message')?.value?.trim() || '';

      setLoading(true, 'Saving settings…');
      try {
        const data = await apiFetch('/api/repository/settings', {
          method: 'POST',
          body: JSON.stringify({
            authorName,
            authorEmail,
            githubUsername,
            defaultBranch,
            remoteName,
            defaultCommitMessage
          })
        });

        state.settings = data.settings;
        populateAuthorAndSettingsInputs(data.settings);
        toast('Settings saved successfully! Details updated across all tools.', 'success');
        updateGitStatusBar();
      } catch (err) {
        toast('Failed to save settings: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    });
  }
}

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
  initSettings();
});
