/**
 * commitLab.js
 * 
 * Manages the interactive Commit Lab.
 * Creates real Git commits with custom author/committer dates and author details.
 */

const CommitLabManager = {
  init() {
    this.setDefaultDate();
    this.bindEvents();
  },

  setDefaultDate() {
    const labDate = document.getElementById('labDate');
    if (labDate && !labDate.value) {
      const today = new Date().toISOString().split('T')[0];
      labDate.value = today;
    }
  },

  bindEvents() {
    const form = document.getElementById('formCommitLab');
    const btnPreview = document.getElementById('btnPreviewLabCommit');

    if (btnPreview) {
      btnPreview.addEventListener('click', () => this.handlePreview());
    }

    if (form) {
      form.addEventListener('submit', (e) => this.handleCreate(e));
    }
  },

  getFormData() {
    return {
      date: document.getElementById('labDate').value,
      time: document.getElementById('labTime').value || '12:00',
      count: parseInt(document.getElementById('labCount').value, 10) || 1,
      message: document.getElementById('labMessage').value.trim() || 'Git learning commit',
      authorName: document.getElementById('labAuthorName').value.trim(),
      authorEmail: document.getElementById('labAuthorEmail').value.trim()
    };
  },

  async handlePreview() {
    const data = this.getFormData();
    const previewBox = document.getElementById('labPreviewBox');
    const createdBox = document.getElementById('labCreatedList');

    if (createdBox) createdBox.style.display = 'none';

    if (!data.date) {
      App.showToast('Please select a target date.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/commits/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();

      if (result.success) {
        const p = result.preview;
        previewBox.innerHTML = `
          <div style="color: #79c0ff; font-weight: 700; margin-bottom: 8px;">✓ Commit Plan Preview:</div>
          <div><strong>Target Repository:</strong> <code>${p.targetRepository}</code></div>
          <div><strong>Target Timestamp:</strong> <code>${p.sampleDate}</code></div>
          <div><strong>Commit Count:</strong> <span class="font-bold">${p.commitCount} real commit(s)</span></div>
          <div><strong>Commit Message:</strong> "${p.message}"</div>
          <div><strong>Author:</strong> ${p.author}</div>
          <div style="margin-top: 8px; font-size: 0.78rem; color: #8b949e;">
            Ready to execute. Commits will use <code>GIT_AUTHOR_DATE</code> and <code>--allow-empty</code>.
          </div>
        `;
      } else {
        previewBox.innerHTML = `<span style="color: #f85149;">Error: ${result.error}</span>`;
      }
    } catch (err) {
      previewBox.innerHTML = `<span style="color: #f85149;">Error: ${err.message}</span>`;
    }
  },

  async handleCreate(e) {
    e.preventDefault();
    const data = this.getFormData();
    const btnCreate = document.getElementById('btnCreateLabCommit');
    const previewBox = document.getElementById('labPreviewBox');
    const createdBox = document.getElementById('labCreatedList');
    const hashesList = document.getElementById('labHashesList');

    if (!data.date) {
      App.showToast('Please select a target date.', 'error');
      return;
    }

    btnCreate.disabled = true;
    btnCreate.textContent = 'Creating Git Commits...';

    try {
      const res = await fetch('/api/commits/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();

      if (result.success) {
        App.showToast(result.message, 'success');
        
        previewBox.innerHTML = `
          <div style="color: #3fb950; font-weight: 700; margin-bottom: 6px;">
            ✓ Success! Created ${result.createdCount} commit(s) in Git repository.
          </div>
          <div>Date: <strong>${data.date}</strong> | Count: <strong>${result.createdCount}</strong></div>
        `;

        if (createdBox && hashesList) {
          createdBox.style.display = 'block';
          hashesList.innerHTML = result.commits.map(c => 
            `<div>• <span style="color: #79c0ff;">${c.shortHash}</span> - "${c.message}" (${c.date})</div>`
          ).join('');
        }

        // Refresh live dashboard and calendar
        RepoManager.refreshStatus();
      } else {
        App.showToast(result.error || 'Failed to create commits', 'error');
        previewBox.innerHTML = `<span style="color: #f85149;">Error: ${result.error}</span>`;
      }
    } catch (err) {
      App.showToast(`Error: ${err.message}`, 'error');
    } finally {
      btnCreate.disabled = false;
      btnCreate.textContent = '🚀 Create Real Git Commits';
    }
  }
};
