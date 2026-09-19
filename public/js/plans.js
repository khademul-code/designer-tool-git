/**
 * plans.js
 * 
 * Manages Commit Plans in data/plans.json.
 * Clearly separates intended plans from actual Git history.
 */

const PlansManager = {
  init() {
    this.bindEvents();
  },

  bindEvents() {
    const btnRefresh = document.getElementById('btnRefreshPlans');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => this.loadPlans());
    }
  },

  async loadPlans() {
    const container = document.getElementById('plansListContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder">Loading saved plans...</div>';

    try {
      const res = await fetch('/api/plans');
      const data = await res.json();

      if (!data.success || data.plans.length === 0) {
        container.innerHTML = '<div class="empty-state">No commit plans created yet. Use the Contribution Designer or Commit Lab to generate plans.</div>';
        return;
      }

      container.innerHTML = '';
      data.plans.forEach(plan => {
        const isCompleted = plan.status === 'completed';
        const card = document.createElement('div');
        card.className = 'plan-card';

        card.innerHTML = `
          <div class="plan-header">
            <div>
              <span class="plan-title">${plan.name}</span>
              <span class="status-pill ${isCompleted ? 'pill-success' : 'pill-warning'}" style="margin-left: 8px;">
                ${isCompleted ? '✓ Completed (In Git)' : '⏳ Planned Only (Not in Git)'}
              </span>
            </div>
            <span class="text-muted font-mono" style="font-size: 0.75rem;">${new Date(plan.createdAt).toLocaleDateString()}</span>
          </div>

          <div class="plan-stats-bar">
            <div><strong>Total Days:</strong> ${plan.totalDays || plan.schedule?.length || 0}</div>
            <div><strong>Total Commits:</strong> <span style="color: #3fb950; font-weight: 700;">${plan.totalCommits || 0} commits</span></div>
            <div><strong>Source:</strong> <code>${plan.source || 'designer'}</code></div>
          </div>

          <div class="plan-actions-row">
            <div style="font-size: 0.8rem; color: #8b949e;">
              ${isCompleted ? `Applied to Git at ${new Date(plan.completedAt).toLocaleTimeString()}` : 'Plan is ready to be converted into real Git commits.'}
            </div>
            <div style="display: flex; gap: 8px;">
              ${!isCompleted ? `<button class="btn btn-primary btn-sm" onclick="PlansManager.handleApplyPlan('${plan.id}')">🚀 Apply Plan Locally</button>` : ''}
              <button class="btn btn-secondary btn-sm" onclick="PlansManager.handleDeletePlan('${plan.id}')">Delete Plan</button>
            </div>
          </div>
        `;

        container.appendChild(card);
      });
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Error loading plans: ${err.message}</div>`;
    }
  },

  async handleApplyPlan(planId) {
    if (!confirm('Apply this plan? Real Git commits will be created in your target repository.')) return;

    try {
      const res = await fetch(`/api/plans/${planId}/apply`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        App.showToast(data.message, 'success');
        RepoManager.refreshStatus();
        this.loadPlans();
      } else {
        App.showToast(data.error || 'Failed to apply plan', 'error');
      }
    } catch (err) {
      App.showToast(`Error: ${err.message}`, 'error');
    }
  },

  async handleDeletePlan(planId) {
    if (!confirm('Delete this plan?')) return;

    try {
      const res = await fetch(`/api/plans/${planId}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        App.showToast('Plan deleted', 'info');
        this.loadPlans();
      } else {
        App.showToast('Failed to delete plan', 'error');
      }
    } catch (err) {
      App.showToast(`Error: ${err.message}`, 'error');
    }
  }
};
