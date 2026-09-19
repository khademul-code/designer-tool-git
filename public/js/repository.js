/**
 * repository.js
 * 
 * Manages repository API interactions, settings persistence, validation,
 * and live Git status rendering for Dashboard, Remote, and Settings views.
 */

const RepoManager = {
  currentStatus: null,
  currentSettings: null,

  /**
   * Initializes the repository manager on page load.
   */
  async init() {
    this.bindEvents();
    await this.checkGitCli();
    await this.loadSettings();
    await this.refreshStatus();
  },

  /**
   * Binds UI events for form submission, testing path, and refreshing.
   */
  bindEvents() {
    const form = document.getElementById('formSettings');
    const btnValidateOnly = document.getElementById('btnValidateOnly');
    const btnRefresh = document.getElementById('btnRefreshStatus');
    const btnCancel = document.getElementById('btnCancelSettings');
    const btnFixSettings = document.getElementById('btnFixSettings');

    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveSettings(e));
    }

    if (btnValidateOnly) {
      btnValidateOnly.addEventListener('click', () => this.handleValidateOnly());
    }

    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => this.refreshStatus(true));
    }

    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        this.populateSettingsForm(this.currentSettings);
        App.switchTab('dashboard');
      });
    }

    if (btnFixSettings) {
      btnFixSettings.addEventListener('click', () => {
        App.switchTab('settings');
      });
    }
  },

  /**
   * Checks if Git CLI is installed and running on the host system.
   */
  async checkGitCli() {
    const statusBox = document.getElementById('gitCliStatus');
    const statusText = document.getElementById('gitCliText');

    try {
      const res = await fetch('/api/git/check');
      const data = await res.json();

      if (data.installed) {
        statusBox.className = 'git-cli-status online';
        statusText.textContent = data.version || 'Git CLI Ready';
      } else {
        statusBox.className = 'git-cli-status offline';
        statusText.textContent = 'Git CLI Not Found';
        App.showToast(data.error || 'Git is not installed on this system', 'error');
      }
    } catch (err) {
      statusBox.className = 'git-cli-status offline';
      statusText.textContent = 'Git CLI Check Failed';
    }
  },

  /**
   * Fetches saved settings from the backend.
   */
  async loadSettings() {
    try {
      const res = await fetch('/api/repository/settings');
      const data = await res.json();
      if (data.success) {
        this.currentSettings = data.settings;
        this.populateSettingsForm(data.settings);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  },

  /**
   * Populates the settings form fields.
   */
  populateSettingsForm(settings) {
    if (!settings) return;
    const pathInput = document.getElementById('inputRepoPath');
    const branchInput = document.getElementById('inputDefaultBranch');
    const remoteInput = document.getElementById('inputRemoteName');
    const authorInput = document.getElementById('inputAuthorName');
    const emailInput = document.getElementById('inputAuthorEmail');
    const msgInput = document.getElementById('inputDefaultCommitMsg');

    if (pathInput) pathInput.value = settings.repositoryPath || '';
    if (branchInput) branchInput.value = settings.defaultBranch || 'main';
    if (remoteInput) remoteInput.value = settings.remoteName || 'origin';
    if (authorInput) authorInput.value = settings.authorName || 'Git Learner';
    if (emailInput) emailInput.value = settings.authorEmail || 'learner@example.com';
    if (msgInput) msgInput.value = settings.defaultCommitMessage || 'Git learning commit';
  },

  /**
   * Validates a candidate path without saving it.
   */
  async handleValidateOnly() {
    const pathInput = document.getElementById('inputRepoPath');
    const repoPath = pathInput.value.trim();

    if (!repoPath) {
      this.showValidationAlert('Please enter a directory path to test.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/repository/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath })
      });
      const data = await res.json();

      if (data.isValid) {
        this.showValidationAlert(`✓ Valid Git repository: "${repoPath}"`, 'success');
      } else {
        this.showValidationAlert(`✗ ${data.message}`, 'error');
      }
    } catch (err) {
      this.showValidationAlert(`Network error: ${err.message}`, 'error');
    }
  },

  /**
   * Displays the inline validation feedback message.
   */
  showValidationAlert(message, type = 'success') {
    const alertBox = document.getElementById('validationResultAlert');
    if (!alertBox) return;
    alertBox.style.display = 'block';
    alertBox.className = `validation-alert ${type}`;
    alertBox.textContent = message;
  },

  /**
   * Handles saving new repository settings.
   */
  async handleSaveSettings(e) {
    e.preventDefault();
    const btnSave = document.getElementById('btnSaveSettings');
    btnSave.disabled = true;
    btnSave.textContent = 'Saving...';

    const payload = {
      repositoryPath: document.getElementById('inputRepoPath').value.trim(),
      defaultBranch: document.getElementById('inputDefaultBranch').value.trim(),
      remoteName: document.getElementById('inputRemoteName').value.trim(),
      authorName: document.getElementById('inputAuthorName').value.trim(),
      authorEmail: document.getElementById('inputAuthorEmail').value.trim(),
      defaultCommitMessage: document.getElementById('inputDefaultCommitMsg').value.trim()
    };

    try {
      const res = await fetch('/api/repository/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        this.currentSettings = data.settings;
        this.currentStatus = data.status;
        this.renderDashboard(data.status);

        if (data.status.validation.isValid) {
          App.showToast('Repository settings saved successfully!', 'success');
          App.switchTab('dashboard');
        } else {
          this.showValidationAlert(`Settings saved, but path is invalid: ${data.status.validation.message}`, 'error');
          App.showToast(data.status.validation.message, 'error');
        }
      } else {
        App.showToast(data.error || 'Failed to save settings', 'error');
      }
    } catch (err) {
      App.showToast(`Error: ${err.message}`, 'error');
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = '💾 Save & Apply Settings';
    }
  },

  /**
   * Refreshes the target repository status from the backend.
   */
  async refreshStatus(showNotification = false) {
    try {
      const res = await fetch('/api/repository/status');
      const data = await res.json();
      if (data.success) {
        this.currentStatus = data.status;
        this.renderDashboard(data.status);
        if (window.RemoteManager) {
          RemoteManager.updateRemoteView(data.status);
        }
        if (showNotification) {
          App.showToast('Git status refreshed', 'info');
        }
      }
    } catch (err) {
      console.error('Failed to refresh status:', err);
      if (showNotification) {
        App.showToast('Failed to refresh Git status', 'error');
      }
    }
  },

  /**
   * Updates all Dashboard elements with fresh Git status data.
   */
  renderDashboard(status) {
    if (!status) return;

    const { validation, git, settings } = status;

    // Sidebar indicators
    const sidebarDot = document.getElementById('sidebarDot');
    const sidebarRepoName = document.getElementById('sidebarRepoName');

    // Dashboard Warning Banner
    const warningBanner = document.getElementById('dashboardWarning');
    const warningTitle = document.getElementById('warningTitle');
    const warningMessage = document.getElementById('warningMessage');

    // Card 1: Repository identity
    const cardRepoStatus = document.getElementById('cardRepoStatus');
    const cardRepoName = document.getElementById('cardRepoName');
    const cardRepoPath = document.getElementById('cardRepoPath');

    // Card 2: Branch & Remote
    const cardRemoteStatus = document.getElementById('cardRemoteStatus');
    const cardBranch = document.getElementById('cardBranch');
    const cardRemoteUrl = document.getElementById('cardRemoteUrl');

    // Card 3: Working Tree
    const cardTreeStatus = document.getElementById('cardTreeStatus');
    const cardModifiedCount = document.getElementById('cardModifiedCount');
    const cardUntrackedCount = document.getElementById('cardUntrackedCount');

    // Card 4: History
    const cardCommitBadge = document.getElementById('cardCommitBadge');
    const cardTotalCommits = document.getElementById('cardTotalCommits');
    const cardUnpushedCount = document.getElementById('cardUnpushedCount');
    const cardLastCommitHash = document.getElementById('cardLastCommitHash');
    const cardLastCommitMsg = document.getElementById('cardLastCommitMsg');

    // Raw Status Output
    const rawGitStatus = document.getElementById('rawGitStatus');

    if (!validation.isConfigured) {
      if (sidebarDot) sidebarDot.className = 'badge-status-dot warning';
      if (sidebarRepoName) sidebarRepoName.textContent = 'Not Configured';

      if (warningBanner) warningBanner.style.display = 'flex';
      if (warningTitle) warningTitle.textContent = 'Target Repository Not Configured';
      if (warningMessage) warningMessage.textContent = 'Please configure a local test repository path in Settings to start.';

      if (cardRepoStatus) { cardRepoStatus.className = 'status-pill pill-warning'; cardRepoStatus.textContent = 'Unset'; }
      if (cardRepoName) cardRepoName.textContent = 'No Repository';
      if (cardRepoPath) cardRepoPath.textContent = 'Go to Settings to select a repository';

      if (cardRemoteStatus) { cardRemoteStatus.className = 'status-pill pill-neutral'; cardRemoteStatus.textContent = 'No Remote'; }
      if (cardBranch) cardBranch.textContent = '--';
      if (cardRemoteUrl) cardRemoteUrl.textContent = 'None';

      if (cardTreeStatus) { cardTreeStatus.className = 'status-pill pill-neutral'; cardTreeStatus.textContent = 'N/A'; }
      if (cardModifiedCount) cardModifiedCount.textContent = '0';
      if (cardUntrackedCount) cardUntrackedCount.textContent = '0';

      if (cardCommitBadge) cardCommitBadge.textContent = '0 Commits';
      if (cardTotalCommits) cardTotalCommits.textContent = '0';
      if (cardUnpushedCount) cardUnpushedCount.textContent = '0';
      if (cardLastCommitHash) cardLastCommitHash.textContent = 'None';
      if (cardLastCommitMsg) cardLastCommitMsg.textContent = 'No repository selected';

      if (rawGitStatus) rawGitStatus.textContent = 'No repository selected.';
      return;
    }

    if (!validation.isValid) {
      if (sidebarDot) sidebarDot.className = 'badge-status-dot danger';
      if (sidebarRepoName) sidebarRepoName.textContent = 'Invalid Path';

      if (warningBanner) warningBanner.style.display = 'flex';
      if (warningTitle) warningTitle.textContent = 'Repository Error';
      if (warningMessage) warningMessage.textContent = validation.message;

      if (cardRepoStatus) { cardRepoStatus.className = 'status-pill pill-danger'; cardRepoStatus.textContent = 'Invalid'; }
      if (cardRepoName) cardRepoName.textContent = 'Invalid Target';
      if (cardRepoPath) cardRepoPath.textContent = settings.repositoryPath;

      if (cardRemoteStatus) { cardRemoteStatus.className = 'status-pill pill-neutral'; cardRemoteStatus.textContent = 'N/A'; }
      if (cardBranch) cardBranch.textContent = '--';
      if (cardRemoteUrl) cardRemoteUrl.textContent = 'None';

      if (cardTreeStatus) { cardTreeStatus.className = 'status-pill pill-danger'; cardTreeStatus.textContent = 'Error'; }
      if (cardModifiedCount) cardModifiedCount.textContent = '0';
      if (cardUntrackedCount) cardUntrackedCount.textContent = '0';

      if (cardCommitBadge) cardCommitBadge.textContent = '0 Commits';
      if (cardTotalCommits) cardTotalCommits.textContent = '0';
      if (cardUnpushedCount) cardUnpushedCount.textContent = '0';
      if (cardLastCommitHash) cardLastCommitHash.textContent = 'None';
      if (cardLastCommitMsg) cardLastCommitMsg.textContent = validation.message;

      if (rawGitStatus) rawGitStatus.textContent = `Error: ${validation.message}`;
      return;
    }

    // Valid Git repository!
    if (warningBanner) warningBanner.style.display = 'none';

    const repoFolderName = settings.repositoryPath.split(/[/\\]/).filter(Boolean).pop() || 'Target Repo';

    if (sidebarDot) sidebarDot.className = 'badge-status-dot active';
    if (sidebarRepoName) sidebarRepoName.textContent = repoFolderName;

    if (cardRepoStatus) { cardRepoStatus.className = 'status-pill pill-success'; cardRepoStatus.textContent = 'Connected'; }
    if (cardRepoName) cardRepoName.textContent = repoFolderName;
    if (cardRepoPath) cardRepoPath.textContent = settings.repositoryPath;

    // Remote & Branch
    if (cardBranch) cardBranch.textContent = git.branch || 'main';
    if (cardRemoteStatus) {
      if (git.hasOriginRemote && git.remoteUrl) {
        cardRemoteStatus.className = 'status-pill pill-success';
        cardRemoteStatus.textContent = 'Remote Set';
      } else {
        cardRemoteStatus.className = 'status-pill pill-neutral';
        cardRemoteStatus.textContent = 'No Remote';
      }
    }
    if (cardRemoteUrl) {
      cardRemoteUrl.textContent = (git.hasOriginRemote && git.remoteUrl) ? git.remoteUrl : 'Local only (no remote configured)';
    }

    // Working tree
    if (cardTreeStatus) {
      if (git.isClean) {
        cardTreeStatus.className = 'status-pill pill-success';
        cardTreeStatus.textContent = 'Clean';
      } else {
        cardTreeStatus.className = 'status-pill pill-warning';
        cardTreeStatus.textContent = 'Uncommitted Changes';
      }
    }
    if (cardModifiedCount) cardModifiedCount.textContent = git.modifiedCount || 0;
    if (cardUntrackedCount) cardUntrackedCount.textContent = git.untrackedCount || 0;

    // History
    if (cardTotalCommits) cardTotalCommits.textContent = git.totalCommits || 0;
    if (cardUnpushedCount) cardUnpushedCount.textContent = git.unpushedCommits || 0;
    if (cardCommitBadge) {
      cardCommitBadge.className = git.totalCommits > 0 ? 'status-pill pill-success' : 'status-pill pill-neutral';
      cardCommitBadge.textContent = `${git.totalCommits} Commit${git.totalCommits === 1 ? '' : 's'}`;
    }

    if (git.lastCommit) {
      if (cardLastCommitHash) cardLastCommitHash.textContent = `${git.lastCommit.shortHash} (${git.lastCommit.authorName})`;
      if (cardLastCommitMsg) cardLastCommitMsg.textContent = `"${git.lastCommit.message}" • ${git.lastCommit.authorDate}`;
    } else {
      if (cardLastCommitHash) cardLastCommitHash.textContent = 'None';
      if (cardLastCommitMsg) cardLastCommitMsg.textContent = 'Repository is empty (0 commits). Ready for test commits!';
    }

    // Raw Git status
    if (rawGitStatus) {
      if (git.rawStatus) {
        rawGitStatus.textContent = git.rawStatus;
      } else {
        rawGitStatus.textContent = `Working tree clean. Nothing to commit, working tree clean on branch "${git.branch}".`;
      }
    }
  }
};
