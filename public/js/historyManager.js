/**
 * historyManager.js
 * 
 * Controlled History Management for learning & disposable test repositories.
 * Requires explicit confirmation before running destructive Git operations.
 */

const HistoryLabManager = {
  init() {
    this.bindEvents();
  },

  bindEvents() {
    const btnResetOne = document.getElementById('btnResetOneCommit');
    const btnResetN = document.getElementById('btnResetNCommits');
    const btnResetBranch = document.getElementById('btnResetTestBranch');

    if (btnResetOne) btnResetOne.addEventListener('click', () => this.confirmResetCommits(1));
    if (btnResetN) {
      btnResetN.addEventListener('click', () => {
        const count = parseInt(document.getElementById('resetCountInput').value, 10) || 1;
        this.confirmResetCommits(count);
      });
    }
    if (btnResetBranch) btnResetBranch.addEventListener('click', () => this.confirmResetBranch());
  },

  confirmResetCommits(count) {
    const bodyHtml = `
      <p style="margin-bottom: 12px;">
        Are you sure you want to reset the <strong>last ${count} commit(s)</strong>?
      </p>
      <div style="background: rgba(210, 153, 34, 0.15); border: 1px solid #d29922; padding: 10px; border-radius: 6px; font-size: 0.82rem; color: #f0e6c8; margin-bottom: 12px;">
        ⚠️ <strong>Git Action:</strong> This runs <code>git reset --hard HEAD~${count}</code>. The selected commits will be permanently removed from this branch.
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-warning" id="btnExecuteResetCommits">Yes, Reset ${count} Commit(s)</button>
    `;

    App.showModal(`Confirm Reset ${count} Commit(s)`, bodyHtml, footerHtml);

    document.getElementById('btnExecuteResetCommits')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnExecuteResetCommits');
      btn.disabled = true;
      btn.textContent = 'Resetting...';

      try {
        const res = await fetch('/api/git/reset-commits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count, hard: true })
        });
        const data = await res.json();

        App.closeModal();

        if (data.success) {
          App.showToast(data.message, 'success');
          RepoManager.refreshStatus();
          CalendarManager.loadCalendar();
          HistoryManager.loadHistory();
        } else {
          App.showToast(data.error || 'Reset failed', 'error');
        }
      } catch (err) {
        App.closeModal();
        App.showToast(`Error: ${err.message}`, 'error');
      }
    });
  },

  confirmResetBranch() {
    const settings = RepoManager.currentSettings || {};
    const branch = settings.defaultBranch || 'main';

    const bodyHtml = `
      <p style="margin-bottom: 12px;">
        Are you sure you want to reset branch <strong>"${branch}"</strong> to an empty state?
      </p>
      <div style="background: rgba(248, 81, 73, 0.15); border: 1px solid #f85149; padding: 10px; border-radius: 6px; font-size: 0.82rem; color: #ffa198;">
        🚨 <strong>WARNING:</strong> This will erase all commits on this test branch and start fresh. Use only on disposable test repositories!
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-danger" id="btnExecuteResetBranch">Yes, Reset Entire Branch</button>
    `;

    App.showModal('Confirm Complete Branch Reset', bodyHtml, footerHtml);

    document.getElementById('btnExecuteResetBranch')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnExecuteResetBranch');
      btn.disabled = true;
      btn.textContent = 'Resetting Branch...';

      try {
        const res = await fetch('/api/git/reset-branch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchName: branch })
        });
        const data = await res.json();

        App.closeModal();

        if (data.success) {
          App.showToast(data.message, 'success');
          RepoManager.refreshStatus();
          CalendarManager.loadCalendar();
          HistoryManager.loadHistory();
        } else {
          App.showToast(data.error || 'Branch reset failed', 'error');
        }
      } catch (err) {
        App.closeModal();
        App.showToast(`Error: ${err.message}`, 'error');
      }
    });
  }
};
