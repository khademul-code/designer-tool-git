/**
 * designer.js
 * 
 * Interactive pixel art contribution designer.
 * Supports drawing tools (pen, eraser, fill, clear, undo, redo),
 * intensity selection, schedule generation, and applying designs to Git.
 */

const DesignerManager = {
  rows: 7, // Sunday to Saturday
  cols: 16, // 16 weeks
  grid: [], // 2D array [row][col]

  currentTool: 'pen', // 'pen' | 'eraser'
  currentIntensity: 1, // 1, 2, 4, 7
  isMouseDown: false,

  undoStack: [],
  redoStack: [],

  init() {
    this.initGrid();
    this.setDefaultStartDate();
    this.bindEvents();
    this.renderGrid();
    this.updateStats();
  },

  initGrid(width = 16) {
    this.cols = width;
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(0);
      }
      this.grid.push(row);
    }
  },

  setDefaultStartDate() {
    const startInput = document.getElementById('designerStartDate');
    if (startInput && !startInput.value) {
      const d = new Date();
      // Adjust to next Sunday or today
      startInput.value = d.toISOString().split('T')[0];
    }
  },

  saveStateForUndo() {
    const clone = this.grid.map(row => [...row]);
    this.undoStack.push(clone);
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = []; // Clear redo stack on new action
  },

  bindEvents() {
    const toolPen = document.getElementById('toolPen');
    const toolEraser = document.getElementById('toolEraser');
    const toolFill = document.getElementById('toolFill');
    const toolClear = document.getElementById('toolClear');
    const btnUndo = document.getElementById('btnDesignerUndo');
    const btnRedo = document.getElementById('btnDesignerRedo');
    const presetsSelect = document.getElementById('designerPresets');

    const btnSave = document.getElementById('btnSaveDesign');
    const btnLoad = document.getElementById('btnLoadDesignsModal');
    const btnPreview = document.getElementById('btnPreviewSchedule');
    const btnApply = document.getElementById('btnApplyDesignLocally');

    // Tool switching
    if (toolPen) {
      toolPen.addEventListener('click', () => {
        this.currentTool = 'pen';
        toolPen.classList.add('active');
        toolEraser?.classList.remove('active');
      });
    }

    if (toolEraser) {
      toolEraser.addEventListener('click', () => {
        this.currentTool = 'eraser';
        toolEraser.classList.add('active');
        toolPen?.classList.remove('active');
      });
    }

    if (toolFill) {
      toolFill.addEventListener('click', () => {
        this.saveStateForUndo();
        const value = this.currentTool === 'eraser' ? 0 : this.currentIntensity;
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            this.grid[r][c] = value;
          }
        }
        this.renderGrid();
        this.updateStats();
      });
    }

    if (toolClear) {
      toolClear.addEventListener('click', () => {
        this.saveStateForUndo();
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            this.grid[r][c] = 0;
          }
        }
        this.renderGrid();
        this.updateStats();
      });
    }

    // Intensity buttons
    document.querySelectorAll('.intensity-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.intensity-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentIntensity = parseInt(btn.getAttribute('data-intensity'), 10) || 1;
        this.currentTool = 'pen';
        toolPen?.classList.add('active');
        toolEraser?.classList.remove('active');
      });
    });

    // Undo / Redo
    if (btnUndo) {
      btnUndo.addEventListener('click', () => this.handleUndo());
    }
    if (btnRedo) {
      btnRedo.addEventListener('click', () => this.handleRedo());
    }

    // Presets
    if (presetsSelect) {
      presetsSelect.addEventListener('change', (e) => this.loadPreset(e.target.value));
    }

    // Global mouseup to cancel dragging
    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });

    // Action buttons
    if (btnSave) btnSave.addEventListener('click', () => this.handleSaveDesign());
    if (btnLoad) btnLoad.addEventListener('click', () => this.handleOpenSavedDesignsModal());
    if (btnPreview) btnPreview.addEventListener('click', () => this.handlePreviewSchedule());
    if (btnApply) btnApply.addEventListener('click', () => this.handleApplyLocally());
  },

  handleUndo() {
    if (this.undoStack.length === 0) return;
    const currentState = this.grid.map(row => [...row]);
    this.redoStack.push(currentState);
    this.grid = this.undoStack.pop();
    this.cols = this.grid[0].length;
    this.renderGrid();
    this.updateStats();
  },

  handleRedo() {
    if (this.redoStack.length === 0) return;
    const currentState = this.grid.map(row => [...row]);
    this.undoStack.push(currentState);
    this.grid = this.redoStack.pop();
    this.cols = this.grid[0].length;
    this.renderGrid();
    this.updateStats();
  },

  async loadPreset(presetId) {
    if (!presetId) return;
    try {
      const res = await fetch(`/api/designs/${presetId}`);
      const data = await res.json();
      if (data.success && data.design) {
        this.saveStateForUndo();
        this.grid = data.design.grid;
        this.cols = data.design.width || data.design.grid[0].length;
        document.getElementById('designerNameInput').value = data.design.name;
        this.renderGrid();
        this.updateStats();
        App.showToast(`Loaded preset: "${data.design.name}"`, 'info');
      }
    } catch (err) {
      console.error('Failed to load preset:', err);
    }
  },

  getIntensityClass(count) {
    if (count <= 0) return 'lvl-0';
    if (count === 1) return 'lvl-1';
    if (count <= 3) return 'lvl-2';
    if (count <= 6) return 'lvl-3';
    return 'lvl-4';
  },

  paintCell(r, c) {
    const value = this.currentTool === 'eraser' ? 0 : this.currentIntensity;
    if (this.grid[r][c] !== value) {
      this.grid[r][c] = value;
      const cellEl = document.querySelector(`.designer-cell[data-row="${r}"][data-col="${c}"]`);
      if (cellEl) {
        cellEl.className = `designer-cell ${this.getIntensityClass(value)}`;
        cellEl.textContent = value > 0 ? value : '';
      }
      this.updateStats();
    }
  },

  renderGrid() {
    const container = document.getElementById('designerPixelGrid');
    if (!container) return;

    container.innerHTML = '';

    // Render columns (weeks)
    for (let c = 0; c < this.cols; c++) {
      const colEl = document.createElement('div');
      colEl.className = 'designer-col';

      for (let r = 0; r < this.rows; r++) {
        const val = this.grid[r][c] || 0;
        const cell = document.createElement('div');
        cell.className = `designer-cell ${this.getIntensityClass(val)}`;
        cell.setAttribute('data-row', r);
        cell.setAttribute('data-col', c);
        cell.textContent = val > 0 ? val : '';

        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.saveStateForUndo();
          this.isMouseDown = true;
          this.paintCell(r, c);
        });

        cell.addEventListener('mouseenter', () => {
          if (this.isMouseDown) {
            this.paintCell(r, c);
          }
        });

        colEl.appendChild(cell);
      }

      container.appendChild(colEl);
    }
  },

  updateStats() {
    let totalCommits = 0;
    let activeDays = 0;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const val = this.grid[r][c] || 0;
        totalCommits += val;
        if (val > 0) activeDays++;
      }
    }

    const totalEl = document.getElementById('designTotalCommits');
    const activeEl = document.getElementById('designActiveDays');

    if (totalEl) totalEl.textContent = totalCommits;
    if (activeEl) activeEl.textContent = activeDays;
  },

  async handleSaveDesign() {
    const name = document.getElementById('designerNameInput').value.trim() || 'Untitled Pattern';
    try {
      const res = await fetch('/api/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          grid: this.grid,
          width: this.cols,
          height: this.rows
        })
      });
      const data = await res.json();
      if (data.success) {
        App.showToast(`Saved design "${name}"!`, 'success');
      } else {
        App.showToast(data.error || 'Failed to save design', 'error');
      }
    } catch (err) {
      App.showToast(`Error: ${err.message}`, 'error');
    }
  },

  async handleOpenSavedDesignsModal() {
    try {
      const res = await fetch('/api/designs');
      const data = await res.json();

      if (!data.success || data.designs.length === 0) {
        App.showToast('No saved designs found.', 'info');
        return;
      }

      const bodyHtml = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${data.designs.map(d => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: #21262d; padding: 10px 14px; border-radius: 6px;">
              <div>
                <strong>${d.name}</strong>
                ${d.isPreset ? '<span style="font-size: 0.7rem; background: #388bfd; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">Preset</span>' : ''}
                <div style="font-size: 0.75rem; color: #8b949e;">${d.width}x${d.height} grid</div>
              </div>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-primary btn-sm" onclick="DesignerManager.loadDesignObject('${d.id}')">Load</button>
                ${!d.isPreset ? `<button class="btn btn-danger btn-sm" onclick="DesignerManager.deleteDesignById('${d.id}')">Delete</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      App.showModal('Saved Designs', bodyHtml, '<button class="btn btn-secondary" onclick="App.closeModal()">Close</button>');
    } catch (err) {
      App.showToast(`Error loading designs: ${err.message}`, 'error');
    }
  },

  async loadDesignObject(id) {
    try {
      const res = await fetch(`/api/designs/${id}`);
      const data = await res.json();
      if (data.success && data.design) {
        this.saveStateForUndo();
        this.grid = data.design.grid;
        this.cols = data.design.width || data.design.grid[0].length;
        document.getElementById('designerNameInput').value = data.design.name;
        this.renderGrid();
        this.updateStats();
        App.closeModal();
        App.showToast(`Loaded "${data.design.name}"`, 'success');
      }
    } catch (err) {
      App.showToast(`Error: ${err.message}`, 'error');
    }
  },

  async deleteDesignById(id) {
    if (!confirm('Are you sure you want to delete this saved design?')) return;
    try {
      await fetch(`/api/designs/${id}`, { method: 'DELETE' });
      App.showToast('Design deleted', 'info');
      this.handleOpenSavedDesignsModal();
    } catch (err) {
      App.showToast(`Error: ${err.message}`, 'error');
    }
  },

  async handlePreviewSchedule() {
    const startDate = document.getElementById('designerStartDate').value;
    if (!startDate) {
      App.showToast('Please select a pattern start date.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/designs/generate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grid: this.grid, startDate })
      });
      const data = await res.json();

      if (!data.success) {
        App.showToast(data.error || 'Failed to generate schedule', 'error');
        return;
      }

      const { totalDays, activeDays, totalCommits, startDate: sDate, endDate: eDate, schedule } = data.schedule;

      const scheduleRows = schedule.filter(s => s.count > 0).slice(0, 50);

      const bodyHtml = `
        <div style="margin-bottom: 12px;">
          <div><strong>Date Range:</strong> <code>${sDate}</code> to <code>${eDate}</code> (${totalDays} total days)</div>
          <div><strong>Active Days with Commits:</strong> <span class="font-bold">${activeDays} days</span></div>
          <div><strong>Total Git Commits to Create:</strong> <span class="font-bold" style="color: #3fb950;">${totalCommits} commits</span></div>
        </div>
        <div style="max-height: 250px; overflow-y: auto; border: 1px solid #30363d; border-radius: 6px;">
          <table class="daily-summary-table">
            <thead>
              <tr><th>Date</th><th>Day of Week</th><th>Commits Scheduled</th></tr>
            </thead>
            <tbody>
              ${scheduleRows.map(s => `
                <tr>
                  <td class="font-mono">${s.date}</td>
                  <td>${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.dayOfWeek]}</td>
                  <td class="font-bold">${s.count}</td>
                </tr>
              `).join('')}
              ${schedule.filter(s => s.count > 0).length > 50 ? '<tr><td colspan="3" class="text-muted">...and more days</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      `;

      App.showModal('Commit Schedule Preview', bodyHtml, '<button class="btn btn-primary" onclick="App.closeModal()">Got it</button>');
    } catch (err) {
      App.showToast(`Error: ${err.message}`, 'error');
    }
  },

  async handleApplyLocally() {
    const startDate = document.getElementById('designerStartDate').value;
    const name = document.getElementById('designerNameInput').value.trim() || 'Designed Pattern';

    if (!startDate) {
      App.showToast('Please select a pattern start date.', 'error');
      return;
    }

    let totalCommits = 0;
    this.grid.forEach(row => row.forEach(c => totalCommits += c));

    if (totalCommits === 0) {
      App.showToast('Your grid is empty (0 commits). Paint some cells first!', 'warning');
      return;
    }

    const confirmHtml = `
      <p style="margin-bottom: 12px;">
        You are about to create <strong>${totalCommits} real Git commits</strong> in your local target repository starting on <code>${startDate}</code>.
      </p>
      <div style="background: rgba(210, 153, 34, 0.15); border: 1px solid #d29922; padding: 10px; border-radius: 6px; font-size: 0.82rem; color: #f0e6c8; margin-bottom: 12px;">
        ⚠️ <strong>Note:</strong> Commits are created locally in your repository with explicit author timestamps. They will NOT be pushed to GitHub until you explicitly choose to push.
      </div>
    `;

    App.showModal(
      'Confirm Apply Pattern to Git',
      confirmHtml,
      `
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" id="btnConfirmApplyGit">Confirm & Create Commits</button>
      `
    );

    document.getElementById('btnConfirmApplyGit')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnConfirmApplyGit');
      btn.disabled = true;
      btn.textContent = 'Creating Git Commits...';

      try {
        const res = await fetch('/api/designs/apply-locally', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grid: this.grid,
            startDate,
            name
          })
        });
        const result = await res.json();

        App.closeModal();

        if (result.success) {
          App.showToast(result.message, 'success');
          RepoManager.refreshStatus();
          App.switchTab('calendar');
        } else {
          App.showToast(result.error || 'Failed to apply design', 'error');
        }
      } catch (err) {
        App.closeModal();
        App.showToast(`Error: ${err.message}`, 'error');
      }
    });
  }
};
