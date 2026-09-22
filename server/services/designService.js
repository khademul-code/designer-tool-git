/**
 * designService.js
 * 
 * Manages pixel designs in data/designs.json and converts visual grids
 * into sequential commit schedules based on a chosen start date.
 */

const path = require('path');
const { readJsonFile, writeJsonFile } = require('../utils/fileStore');

const DESIGNS_PATH = path.join(__dirname, '../../data/designs.json');

// Built-in presets for learning and quick fun
const DEFAULT_PRESETS = [
  {
    id: 'preset-heart',
    name: 'Heart Pattern',
    isPreset: true,
    width: 9,
    height: 7,
    grid: [
      [0, 2, 3, 0, 0, 0, 3, 2, 0],
      [2, 4, 4, 3, 0, 3, 4, 4, 2],
      [3, 4, 4, 4, 3, 4, 4, 4, 3],
      [0, 3, 4, 4, 4, 4, 4, 3, 0],
      [0, 0, 2, 4, 4, 4, 2, 0, 0],
      [0, 0, 0, 2, 4, 2, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0]
    ]
  },
  {
    id: 'preset-smile',
    name: 'Smiley Face',
    isPreset: true,
    width: 7,
    height: 7,
    grid: [
      [0, 2, 3, 3, 3, 2, 0],
      [2, 0, 4, 0, 4, 0, 2],
      [3, 0, 4, 0, 4, 0, 3],
      [3, 0, 0, 0, 0, 0, 3],
      [3, 4, 0, 0, 0, 4, 3],
      [2, 0, 4, 4, 4, 0, 2],
      [0, 2, 3, 3, 3, 2, 0]
    ]
  },
  {
    id: 'preset-hi',
    name: 'HI! Letters',
    isPreset: true,
    width: 9,
    height: 7,
    grid: [
      [3, 0, 3, 0, 3, 0, 3, 0, 0],
      [3, 0, 3, 0, 0, 0, 3, 0, 0],
      [3, 3, 3, 0, 3, 0, 3, 0, 0],
      [3, 3, 3, 0, 3, 0, 3, 0, 0],
      [3, 0, 3, 0, 3, 0, 0, 0, 0],
      [3, 0, 3, 0, 3, 0, 3, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  }
];

/**
 * Returns all saved designs merged with default presets.
 */
function getAllDesigns() {
  const customDesigns = readJsonFile(DESIGNS_PATH, []);
  return [...DEFAULT_PRESETS, ...customDesigns];
}

/**
 * Finds a design by ID.
 * 
 * @param {string} id 
 */
function getDesignById(id) {
  const designs = getAllDesigns();
  return designs.find(d => d.id === id) || null;
}

/**
 * Saves a new design.
 * 
 * @param {object} designData - { name, grid, width, height }
 */
function saveDesign(designData) {
  const customDesigns = readJsonFile(DESIGNS_PATH, []);
  const id = `design-${Date.now()}`;
  
  const newDesign = {
    id,
    name: designData.name || 'Untitled Pattern',
    isPreset: false,
    width: designData.width || 12,
    height: designData.height || 7,
    grid: designData.grid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  customDesigns.unshift(newDesign);
  writeJsonFile(DESIGNS_PATH, customDesigns);
  return newDesign;
}

/**
 * Updates a design.
 * 
 * @param {string} id 
 * @param {object} updates 
 */
function updateDesign(id, updates) {
  const customDesigns = readJsonFile(DESIGNS_PATH, []);
  const index = customDesigns.findIndex(d => d.id === id);
  if (index === -1) {
    // If it was a preset, save it as a new custom copy
    const preset = DEFAULT_PRESETS.find(p => p.id === id);
    if (preset) {
      return saveDesign({
        name: updates.name || `${preset.name} (Copy)`,
        grid: updates.grid || preset.grid,
        width: updates.width || preset.width,
        height: updates.height || preset.height
      });
    }
    return null;
  }

  customDesigns[index] = {
    ...customDesigns[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  writeJsonFile(DESIGNS_PATH, customDesigns);
  return customDesigns[index];
}

/**
 * Duplicates an existing design.
 * 
 * @param {string} id 
 */
function duplicateDesign(id) {
  const design = getDesignById(id);
  if (!design) return null;

  return saveDesign({
    name: `${design.name} (Copy)`,
    grid: JSON.parse(JSON.stringify(design.grid)),
    width: design.width,
    height: design.height
  });
}

/**
 * Deletes a design by ID.
 * 
 * @param {string} id 
 */
function deleteDesign(id) {
  const customDesigns = readJsonFile(DESIGNS_PATH, []);
  const filtered = customDesigns.filter(d => d.id !== id);
  if (filtered.length === customDesigns.length) return false;
  writeJsonFile(DESIGNS_PATH, filtered);
  return true;
}

/**
 * Converts a 2D contribution grid into a sequential commit schedule starting at `startDate`.
 * 
 * GitHub calendars are organized by columns (weeks) and rows (days 0-6).
 * Column 0, Row 0 is the start day.
 * 
 * @param {Array<Array<number>>} grid - 7 rows x N columns
 * @param {string} startDateString - e.g. "2026-09-01"
 * @returns {object} Schedule object with daily breakdown
 */
function convertGridToSchedule(grid, startDateString) {
  if (!Array.isArray(grid) || grid.length === 0) {
    throw new Error('Invalid grid structure.');
  }

  const startDate = new Date(startDateString);
  if (isNaN(startDate.getTime())) {
    throw new Error('Invalid start date provided.');
  }

  // Snap start date to Sunday so row 0 is Sunday, row 1 is Monday... matching GitHub
  const startSun = new Date(startDate);
  const day = startSun.getDay();
  startSun.setDate(startSun.getDate() - day);

  const rows = grid.length; // usually 7 (Sun-Sat)
  const cols = grid[0].length; // number of weeks/columns

  const schedule = [];
  let totalCommits = 0;
  let activeDays = 0;

  let currentDate = new Date(startSun);

  // Traverse column by column (week by week), then row 0..6 (days of week)
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const commitCount = Math.max(0, parseInt(grid[r][c], 10) || 0);
      
      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, '0');
      const d = String(currentDate.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;

      schedule.push({
        date: dateKey,
        dayOfWeek: currentDate.getDay(),
        count: commitCount,
        gridRow: r,
        gridCol: c
      });

      totalCommits += commitCount;
      if (commitCount > 0) activeDays++;

      // Advance by 1 calendar day
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  const firstDate = schedule[0]?.date || startDateString;
  const lastDate = schedule[schedule.length - 1]?.date || startDateString;

  return {
    startDate: firstDate,
    endDate: lastDate,
    totalDays: schedule.length,
    activeDays,
    totalCommits,
    schedule
  };
}

module.exports = {
  getAllDesigns,
  getDesignById,
  saveDesign,
  updateDesign,
  duplicateDesign,
  deleteDesign,
  convertGridToSchedule
};
