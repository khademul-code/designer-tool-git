/**
 * remote.js
 * 
 * Manages remote repository synchronization (Pull & Push).
 * Requires explicit user confirmation before executing any push.
 */

const RemoteManager = {
  init() {
    this.bindEvents();
  },

  bindEvents() {
    const btnPull = document.getElementById('btnGitPull');
    const btnPush = document.getElementById('btnGitPush');
    const btnForcePush = document.getElementById('btnGitForcePush');

    if (btnPull) btnPull.addEventListener('click', () => this.handlePull());
    if (btnPush) btnPush.addEventListener('click', () => this.handlePush(false));
    if (btnForcePush) btnForcePush.addEventListener('click', () => this.handlePush(true));
  },

  updateRemoteView(status) {
    if (!status || !status.git) return;

    const badge = document.getElementById('remoteStatusBadge');
    const nameEl = document.getElementById('remoteDetailName');
    const urlEl = document.getElementById('remoteDetailUrl');
    const branchEl = document.getElementById('remoteDetailBranch');
    const unpushedEl = document.getElementById('remoteUnpushedCount');

    const { git, settings } = status;

    if (nameEl) nameEl.textContent = settings.remoteName || 'origin';
    if (branchEl) branchEl.textContent = git.branch || settings.defaultBranch || 'main';
    if (unpushedEl) unpushedEl.textContent = git.unpushedCommits || 0;

    if (git.hasOriginRemote && git.remoteUrl) {
      if (badge) {
        badge.className = 'status-pill pill-success';
        badge.textContent = 'Remote Ready';
      }
      if (urlEl) urlEl.textContent = git.remoteUrl;
    } else {
      if (badge) {
        badge.className = 'status-pill pill-warning';
        badge.textContent = 'No Remote Configured';
      }
      if (urlEl) urlEl.textContent = 'Local only (to configure a remote, run "git remote add origin <url>" in your repo)';
    }
  },

  async handlePull() {
    const outputBox = document.getElementById('remoteCommandOutput');
    const btn = document.getElementById('btnGitPull');

    btn.disabled = true;
    btn.textContent = 'Pulling...';
    if (outputBox) outputBox.textContent = 'Executing "git pull"...';

    try {
      const res = await fetch('/api/git/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();

      if (data.success) {
        App.showToast('Pull completed successfully!', 'success');
        if (outputBox) outputBox.textContent = data.output;
        RepoManager.refreshStatus();
      } else {
        App.showToast(data.error || 'Pull failed', 'error');
        if (outputBox) outputBox.textContent = `Error:\n${data.error}`;
      }
    } catch (err) {
      App.showToast(`Error: ${err.message}`, 'error');
      if (outputBox) outputBox.textContent = `Network Error:\n${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = '📥 Pull from Remote';
    }
  },

  handlePush(force = false) {
    const settings = RepoManager.currentSettings || {};
    const status = RepoManager.currentStatus || {};
    const branch = status.git?.branch || settings.defaultBranch || 'main';
    const remote = settings.remoteName || 'origin';
    const remoteUrl = status.git?.remoteUrl || 'Not configured';
    const unpushed = status.git?.unpushedCommits || 0;

    const modalTitle = force ? '⚠️ Confirm Force Push to Remote' : '🚀 Confirm Push to GitHub Remote';

    const bodyHtml = `
      <div style="margin-bottom: 12px;">
        <p>You are about to push commits from your local target repository to the configured remote repository:</p>
      </div>
      <div style="background: #21262d; border: 1px solid #30363d; padding: 12px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 14px;">
        <div><strong>Target Repository:</strong> <code>${settings.repositoryPath}</code></div>
        <div><strong>Branch:</strong> <code>${branch}</code></div>
        <div><strong>Remote Name:</strong> <code>${remote}</code></div>
        <div><strong>Remote URL:</strong> <code>${remoteUrl}</code></div>
        <div><strong>Unpushed Commits:</strong> <span class="font-bold">${unpushed}</span></div>
        <div><strong>Command:</strong> <code>git push ${remote} ${branch} ${force ? '--force' : ''}</code></div>
      </div>
      ${force ? `
        <div style="background: rgba(248, 81, 73, 0.15); border: 1px solid #f85149; padding: 10px; border-radius: 6px; color: #ffa198; font-size: 0.82rem;">
          <strong>CAUTION:</strong> Force pushing overwrites the remote branch history. Only do this on a disposable test repository!
        </div>
      ` : ''}
    `;

    const footerHtml = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn ${force ? 'btn-danger' : 'btn-primary'}" id="btnConfirmPushAction">
        ${force ? 'Confirm Force Push' : 'Confirm & Push to Remote'}
      </button>
    `;

    App.showModal(modalTitle, bodyHtml, footerHtml);

    document.getElementById('btnConfirmPushAction')?.addEventListener('click', async () => {
      const confirmBtn = document.getElementById('btnConfirmPushAction');
      const outputBox = document.getElementById('remoteCommandOutput');
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Pushing to Remote...';

      try {
        const res = await fetch('/api/git/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force })
        });
        const data = await res.json();

        App.closeModal();

        if (data.success) {
          App.showToast('Push completed successfully!', 'success');
          if (outputBox) outputBox.textContent = data.output;
          RepoManager.refreshStatus();
        } else {
          App.showToast(data.error || 'Push failed', 'error');
          if (outputBox) outputBox.textContent = `Error:\n${data.error}`;
        }
      } catch (err) {
        App.closeModal();
        App.showToast(`Error: ${err.message}`, 'error');
        if (outputBox) outputBox.textContent = `Error: ${err.message}`;
      }
    });
  }
};
