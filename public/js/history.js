/**
 * history.js
 * 
 * Manages loading, filtering, and displaying real Git commit history.
 * Displays reverse chronological commit logs and daily totals.
 */

const HistoryManager = {
  init() {
    this.bindEvents();
  },

  bindEvents() {
    const btnFilter = document.getElementById('btnFilterHistory');
    const btnReset = document.getElementById('btnResetHistoryFilter');

    if (btnFilter) {
      btnFilter.addEventListener('click', () => this.loadHistory());
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        document.getElementById('historySearch').value = '';
        document.getElementById('historyAuthor').value = '';
        document.getElementById('historyStartDate').value = '';
        document.getElementById('historyEndDate').value = '';
        this.loadHistory();
      });
    }
  },

  async loadHistory() {
    const timeline = document.getElementById('historyTimeline');
    const matchBadge = document.getElementById('historyMatchCount');
    const dailyTableBody = document.getElementById('dailySummaryTableBody');

    const search = document.getElementById('historySearch')?.value.trim() || '';
    const author = document.getElementById('historyAuthor')?.value.trim() || '';
    const startDate = document.getElementById('historyStartDate')?.value || '';
    const endDate = document.getElementById('historyEndDate')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (author) params.append('author', author);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    if (timeline) {
      timeline.innerHTML = '<div class="empty-state">Loading commits from Git repository...</div>';
    }

    try {
      const res = await fetch(`/api/history?${params.toString()}`);
      const data = await res.json();

      if (!data.success) {
        if (timeline) timeline.innerHTML = `<div class="empty-state">${data.error || 'Failed to load history.'}</div>`;
        return;
      }

      if (matchBadge) {
        matchBadge.textContent = `${data.totalCommits} commit${data.totalCommits === 1 ? '' : 's'}`;
      }

      // Render Commits Timeline
      if (timeline) {
        if (data.commits.length === 0) {
          timeline.innerHTML = '<div class="empty-state">No commits found in repository matching criteria.</div>';
        } else {
          timeline.innerHTML = '';
          data.commits.forEach(c => {
            const card = document.createElement('div');
            card.className = 'commit-card-item';
            card.innerHTML = `
              <div class="commit-header-meta">
                <span class="commit-hash-pill font-mono">${c.shortHash}</span>
                <span class="text-muted">${c.authorDate}</span>
              </div>
              <div class="commit-subject-text">${c.subject}</div>
              <div class="commit-author-row">
                <span>Author: <strong>${c.authorName}</strong> &lt;${c.authorEmail}&gt;</span>
                <span class="text-muted font-mono" style="font-size: 0.7rem;">${c.hash.substring(0, 16)}...</span>
              </div>
            `;
            timeline.appendChild(card);
          });
        }
      }

      // Render Daily Summary Table
      if (dailyTableBody) {
        const dailyKeys = Object.keys(data.dailyTotals || {}).sort().reverse();
        if (dailyKeys.length === 0) {
          dailyTableBody.innerHTML = '<tr><td colspan="2" class="text-muted">No activity found</td></tr>';
        } else {
          dailyTableBody.innerHTML = '';
          dailyKeys.forEach(dateStr => {
            const row = document.createElement('tr');
            row.innerHTML = `
              <td class="font-mono">${dateStr}</td>
              <td class="font-bold">${data.dailyTotals[dateStr]}</td>
            `;
            dailyTableBody.appendChild(row);
          });
        }
      }
    } catch (err) {
      if (timeline) {
        timeline.innerHTML = `<div class="empty-state">Error fetching Git history: ${err.message}</div>`;
      }
    }
  }
};
