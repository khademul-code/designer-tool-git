/**
 * app.js
 * 
 * Main application coordinator for Git Contribution Designer & Git History Lab.
 * Manages tab switching, global modals, toast notifications, and module initialization.
 */

const App = {
  currentTab: 'dashboard',

  /**
   * Initializes the application and all subsystem managers.
   */
  init() {
    this.bindNavigation();
    this.bindModals();

    // Safely initialize each module manager
    try { if (window.RepoManager) RepoManager.init(); } catch (e) { console.error('RepoManager error:', e); }
    try { if (window.CalendarManager) CalendarManager.init(); } catch (e) { console.error('CalendarManager error:', e); }
    try { if (window.HistoryManager) HistoryManager.init(); } catch (e) { console.error('HistoryManager error:', e); }
    try { if (window.CommitLabManager) CommitLabManager.init(); } catch (e) { console.error('CommitLabManager error:', e); }
    try { if (window.DesignerManager) DesignerManager.init(); } catch (e) { console.error('DesignerManager error:', e); }
    try { if (window.PlansManager) PlansManager.init(); } catch (e) { console.error('PlansManager error:', e); }
    try { if (window.RemoteManager) RemoteManager.init(); } catch (e) { console.error('RemoteManager error:', e); }
    try { if (window.HistoryLabManager) HistoryLabManager.init(); } catch (e) { console.error('HistoryLabManager error:', e); }
  },

  /**
   * Binds navigation tabs and quick action buttons.
   */
  bindNavigation() {
    // Sidebar nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (tab) {
          this.switchTab(tab);
        }
      });
    });

    // Header Quick Action button (switches contextually)
    const btnQuickAction = document.getElementById('btnNavQuickAction');
    if (btnQuickAction) {
      btnQuickAction.addEventListener('click', () => {
        if (this.currentTab === 'designer') {
          this.switchTab('calendar');
        } else {
          this.switchTab('designer');
        }
      });
    }
  },

  /**
   * Binds modal close triggers and backdrop clicks.
   */
  bindModals() {
    const backdrop = document.getElementById('modalBackdrop');
    const closeBtn = document.getElementById('modalCloseBtn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          this.closeModal();
        }
      });
    }

    // Escape key to close modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    });
  },

  /**
   * Shows a global modal dialog.
   * 
   * @param {string} title 
   * @param {string} bodyHtml 
   * @param {string} footerHtml 
   */
  showModal(title, bodyHtml, footerHtml = '') {
    const backdrop = document.getElementById('modalBackdrop');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const footerEl = document.getElementById('modalFooter');

    if (!backdrop) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    footerEl.innerHTML = footerHtml;

    backdrop.style.display = 'flex';
  },

  /**
   * Closes the active modal dialog.
   */
  closeModal() {
    const backdrop = document.getElementById('modalBackdrop');
    if (backdrop) {
      backdrop.style.display = 'none';
    }
  },

  /**
   * Switches the active tab view and triggers lazy data loading.
   * 
   * @param {string} tabName 
   */
  switchTab(tabName) {
    this.currentTab = tabName;

    // Update nav items active state
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update tab section visibility
    document.querySelectorAll('.tab-content').forEach(section => {
      section.classList.remove('active');
    });

    const activeSection = document.getElementById(`tab${this.capitalize(tabName)}`);
    if (activeSection) {
      activeSection.classList.add('active');
    }

    // Update Header Titles and perform tab-specific loading
    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');
    const quickIcon = document.getElementById('btnNavQuickActionIcon');
    const quickText = document.getElementById('btnNavQuickActionText');

    switch (tabName) {
      case 'dashboard':
        pageTitle.textContent = 'Dashboard';
        pageSubtitle.textContent = 'Real-time status of your selected target Git repository';
        if (quickIcon) quickIcon.textContent = '🎨';
        if (quickText) quickText.textContent = 'Open Designer';
        RepoManager.refreshStatus();
        break;

      case 'calendar':
        pageTitle.textContent = 'Contribution Calendar';
        pageSubtitle.textContent = 'GitHub-style contribution graph calculated directly from real Git commits';
        if (quickIcon) quickIcon.textContent = '🎨';
        if (quickText) quickText.textContent = 'Design Pattern';
        CalendarManager.loadCalendar();
        break;

      case 'history':
        pageTitle.textContent = 'Git History Log';
        pageSubtitle.textContent = 'Reverse chronological log of all commits in the target repository';
        if (quickIcon) quickIcon.textContent = '🧪';
        if (quickText) quickText.textContent = 'Commit Lab';
        HistoryManager.loadHistory();
        break;

      case 'commitLab':
        pageTitle.textContent = 'Commit Lab';
        pageSubtitle.textContent = 'Create real Git commits on explicit dates with custom author timestamps';
        if (quickIcon) quickIcon.textContent = '📜';
        if (quickText) quickText.textContent = 'View History';
        break;

      case 'designer':
        pageTitle.textContent = 'Contribution Designer';
        pageSubtitle.textContent = 'Draw visual contribution patterns and convert them into real Git commit schedules';
        if (quickIcon) quickIcon.textContent = '📅';
        if (quickText) quickText.textContent = 'View Calendar';
        break;

      case 'plans':
        pageTitle.textContent = 'Commit Plans';
        pageSubtitle.textContent = 'Manage intended commit schedules (distinguished from actual Git history)';
        if (quickIcon) quickIcon.textContent = '🎨';
        if (quickText) quickText.textContent = 'New Design';
        PlansManager.loadPlans();
        break;

      case 'remote':
        pageTitle.textContent = 'Remote & Sync';
        pageSubtitle.textContent = 'Synchronize local Git commits with your configured remote repository';
        if (quickIcon) quickIcon.textContent = '📊';
        if (quickText) quickText.textContent = 'Dashboard';
        RepoManager.refreshStatus();
        break;

      case 'historyManager':
        pageTitle.textContent = 'History Lab';
        pageSubtitle.textContent = 'Controlled, safe Git history operations for your disposable test repository';
        if (quickIcon) quickIcon.textContent = '📜';
        if (quickText) quickText.textContent = 'View History';
        break;

      case 'settings':
        pageTitle.textContent = 'Repository Settings';
        pageSubtitle.textContent = 'Configure target repository path, default branch, and author identity';
        if (quickIcon) quickIcon.textContent = '📊';
        if (quickText) quickText.textContent = 'Dashboard';
        break;
    }
  },

  /**
   * Displays a toast notification.
   * 
   * @param {string} message 
   * @param {'info'|'success'|'error'|'warning'} type 
   * @param {number} duration 
   */
  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '⚠️';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * Capitalizes first letter of string.
   */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
};

// Start application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
