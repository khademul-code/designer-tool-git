/**
 * calendar.js
 * 
 * Renders the GitHub-style Contribution Calendar from REAL Git commit history.
 * Supports year selection, cell hover commit counts, and clicking cells to inspect commits.
 */

const CalendarManager = {
  currentYear: new Date().getFullYear(),
  cachedCalendar: null,

  init() {
    this.bindEvents();
    this.populateYearDropdown();
  },

  bindEvents() {
    const yearSelect = document.getElementById('calYearSelect');
    const btnReload = document.getElementById('btnRefreshCalendar');

    if (yearSelect) {
      yearSelect.addEventListener('change', (e) => {
        this.currentYear = parseInt(e.target.value, 10);
        this.loadCalendar(this.currentYear);
      });
    }

    if (btnReload) {
      btnReload.addEventListener('click', () => {
        this.loadCalendar(this.currentYear);
      });
    }
  },

  populateYearDropdown() {
    const yearSelect = document.getElementById('calYearSelect');
    if (!yearSelect) return;

    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';

    // Offer current year, previous 3 years, and next year for planned activities
    for (let y = currentYear + 1; y >= currentYear - 3; y--) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y}`;
      if (y === currentYear) opt.selected = true;
      yearSelect.appendChild(opt);
    }
  },

  async loadCalendar(year = null) {
    const matrix = document.getElementById('calMatrix');
    const monthHeaders = document.getElementById('calMonthHeaders');
    const totalEl = document.getElementById('calTotalContributions');
    const activeEl = document.getElementById('calActiveDays');
    const peakEl = document.getElementById('calMaxDayCount');

    if (matrix) {
      matrix.innerHTML = '<div class="loading-placeholder">Loading real Git contributions...</div>';
    }

    try {
      const url = year ? `/api/contributions?year=${year}` : '/api/contributions';
      const res = await fetch(url);
      const data = await res.json();

      if (!data.success) {
        if (matrix) matrix.innerHTML = `<div class="empty-state">${data.error || 'Failed to load calendar.'}</div>`;
        return;
      }

      this.cachedCalendar = data.calendar;
      const { weeks, monthLabels, totalContributions, totalActiveDays, maxDayCount } = data.calendar;

      // Update summary chips
      if (totalEl) totalEl.textContent = totalContributions;
      if (activeEl) activeEl.textContent = totalActiveDays;
      if (peakEl) peakEl.textContent = `${maxDayCount} commit${maxDayCount === 1 ? '' : 's'}`;

      // Render Month Headers
      if (monthHeaders) {
        monthHeaders.innerHTML = '';
        monthLabels.forEach(lbl => {
          const span = document.createElement('span');
          span.className = 'cal-month-label';
          // 17px per week column (13px cell + 4px gap)
          span.style.left = `${lbl.weekIndex * 17}px`;
          span.textContent = lbl.monthName;
          monthHeaders.appendChild(span);
        });
      }

      // Render Matrix Grid (Columns = Weeks, Rows = Days)
      if (matrix) {
        matrix.innerHTML = '';

        weeks.forEach(week => {
          const col = document.createElement('div');
          col.className = 'cal-week-col';

          week.forEach(day => {
            const cell = document.createElement('div');
            cell.className = `cal-cell level-${day.intensity} ${!day.isWithinRange ? 'out-of-range' : ''}`;
            cell.title = `${day.date}: ${day.count} commit${day.count === 1 ? '' : 's'}`;
            cell.setAttribute('data-date', day.date);
            cell.setAttribute('data-count', day.count);

            cell.addEventListener('click', () => {
              this.inspectDate(day.date, day.count);
            });

            col.appendChild(cell);
          });

          matrix.appendChild(col);
        });
      }
    } catch (err) {
      if (matrix) {
        matrix.innerHTML = `<div class="empty-state">Error reading contributions: ${err.message}</div>`;
      }
    }
  },

  async inspectDate(dateStr, count) {
    const inspector = document.getElementById('calDateInspector');
    const title = document.getElementById('inspectorDateTitle');
    const badge = document.getElementById('inspectorCommitCount');
    const list = document.getElementById('inspectorCommitsList');

    if (!inspector) return;

    inspector.style.display = 'block';
    title.textContent = `Git Activity on ${dateStr}`;
    badge.textContent = `${count} Commit${count === 1 ? '' : 's'}`;
    list.innerHTML = '<p class="text-muted">Loading commits from Git...</p>';

    // Scroll to inspector smoothly
    inspector.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (count === 0) {
      list.innerHTML = '<p class="text-muted">No Git commits recorded on this date.</p>';
      return;
    }

    try {
      const res = await fetch(`/api/history?startDate=${dateStr}&endDate=${dateStr}`);
      const data = await res.json();

      if (data.success && data.commits.length > 0) {
        list.innerHTML = '';
        data.commits.forEach(commit => {
          const item = document.createElement('div');
          item.className = 'inspector-commit-item';
          item.innerHTML = `
            <div class="inspector-commit-header">
              <span class="commit-hash-pill font-mono">${commit.shortHash}</span>
              <span class="text-muted">${commit.authorDate}</span>
            </div>
            <div class="inspector-commit-msg">${commit.subject}</div>
            <div class="text-muted" style="font-size: 0.75rem; margin-top: 4px;">
              Author: <strong>${commit.authorName}</strong> &lt;${commit.authorEmail}&gt;
            </div>
          `;
          list.appendChild(item);
        });
      } else {
        list.innerHTML = '<p class="text-muted">No commit details found for this date.</p>';
      }
    } catch (err) {
      list.innerHTML = `<p class="text-muted">Failed to inspect commits: ${err.message}</p>`;
    }
  }
};
