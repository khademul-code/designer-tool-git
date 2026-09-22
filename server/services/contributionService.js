/**
 * contributionService.js
 * 
 * Generates the GitHub-style contribution calendar matrix from REAL Git history.
 * Groups dates into 7 rows (Sunday - Saturday) x 52+ columns with intensity levels.
 */

const { getDailyCommitCounts } = require('../git/gitHistory');
const { getSettings } = require('./repositoryService');

/**
 * Calculates intensity level based on commit count.
 * Thresholds:
 * Level 0: 0 commits
 * Level 1: 1 commit
 * Level 2: 2 - 3 commits
 * Level 3: 4 - 6 commits
 * Level 4: 7+ commits
 */
function getIntensityLevel(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

/**
 * Builds a complete GitHub-style contribution calendar for a specific year or rolling 52 weeks.
 * 
 * @param {string} repoPath 
 * @param {number|string} year - Specific year (e.g. 2026) or null for rolling 52 weeks
 * @returns {Promise<object>} Calendar data structure
 */
async function getContributionCalendar(repoPath, year = null) {
  // 1. Fetch real commit counts directly from Git history
  const dailyCounts = await getDailyCommitCounts(repoPath, year);

  // 2. Determine start and end dates for the calendar
  let startDate;
  let endDate;

  const currentYear = year ? parseInt(year, 10) : new Date().getFullYear();

  if (year) {
    startDate = new Date(currentYear, 0, 1); // Jan 1
    endDate = new Date(currentYear, 11, 31); // Dec 31
  } else {
    // Rolling 52 weeks ending today
    endDate = new Date();
    startDate = new Date();
    startDate.setDate(endDate.getDate() - 364);
  }

  // Adjust start date to the beginning of the week (Sunday)
  const adjustedStart = new Date(startDate);
  const startDayOfWeek = adjustedStart.getDay(); // 0 = Sunday
  adjustedStart.setDate(adjustedStart.getDate() - startDayOfWeek);

  // Build the weeks and days grid
  const weeks = [];
  let currentWeek = [];
  let currentDate = new Date(adjustedStart);

  let totalContributions = 0;
  let totalActiveDays = 0;
  let maxDayCount = 0;

  while (currentDate <= endDate || currentWeek.length > 0) {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d = String(currentDate.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;

    const commitCount = dailyCounts[dateKey] || 0;
    const isWithinRange = currentDate >= startDate && currentDate <= endDate;

    if (isWithinRange) {
      totalContributions += commitCount;
      if (commitCount > 0) {
        totalActiveDays++;
        if (commitCount > maxDayCount) maxDayCount = commitCount;
      }
    }

    const dayObj = {
      date: dateKey,
      count: isWithinRange ? commitCount : 0,
      intensity: isWithinRange ? getIntensityLevel(commitCount) : 0,
      isWithinRange,
      dayOfWeek: currentDate.getDay(),
      month: currentDate.getMonth(),
      dayOfMonth: currentDate.getDate()
    };

    currentWeek.push(dayObj);

    // If we've completed a full week (Sunday through Saturday = 7 days)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    currentDate.setDate(currentDate.getDate() + 1);

    // Safety guard to avoid runaway loop
    if (weeks.length > 54) break;
  }

  // Build accurate month header labels directly mapped to week columns
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabels = [];
  const recordedMonths = new Set();

  weeks.forEach((week, wIdx) => {
    const firstDay = week.find(d => d.isWithinRange && (d.dayOfMonth === 1 || (wIdx === 0 && d.isWithinRange)));
    if (firstDay && !recordedMonths.has(firstDay.month)) {
      monthLabels.push({
        weekIndex: wIdx,
        monthName: monthNames[firstDay.month]
      });
      recordedMonths.add(firstDay.month);
    }
  });

  // Weekday labels (Sun, Mon, Tue, Wed, Thu, Fri, Sat)
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return {
    year: currentYear,
    totalContributions,
    totalActiveDays,
    maxDayCount,
    weeks,
    monthLabels,
    weekdays,
    dailyCounts
  };
}

const githubService = require('./githubService');

/**
 * Builds an aligned week-by-week contribution grid for the Art canvas.
 * Guaranteed to start on Sunday (Row 0 = Sun, Row 6 = Sat).
 * 
 * @param {object} options
 * @param {string} [options.repoPath] - Local Git repository path
 * @param {string} options.startDate - e.g. "2026-08-01"
 * @param {number} [options.weeks=12] - Number of week columns (1 to 52)
 * @param {string} [options.source='github'] - 'github' | 'local' | 'both'
 * @param {string} [options.githubUsername] - GitHub username
 * @returns {Promise<object>} Aligned grid data
 */
async function getAlignedGrid(options = {}) {
  const {
    repoPath = '',
    startDate,
    weeks: rawWeeks = 12,
    source = 'github',
    githubUsername = ''
  } = options;

  const numWeeks = Math.max(1, Math.min(53, parseInt(rawWeeks, 10) || 12));
  const baseDate = startDate ? new Date(startDate + 'T00:00:00') : new Date();
  
  // Snap to Sunday of that week
  const startSun = new Date(baseDate);
  const dayOfWeek = startSun.getDay();
  startSun.setDate(startSun.getDate() - dayOfWeek);

  const endSat = new Date(startSun);
  endSat.setDate(endSat.getDate() + (numWeeks * 7) - 1);

  const startYear = startSun.getFullYear();
  const endYear = endSat.getFullYear();

  // 1. Fetch GitHub data if requested and username is provided
  let githubDays = {};
  if ((source === 'github' || source === 'both') && githubUsername) {
    try {
      const res1 = await githubService.fetchGithubUserContributions(githubUsername, startYear);
      Object.assign(githubDays, res1.days || {});

      if (endYear !== startYear) {
        const res2 = await githubService.fetchGithubUserContributions(githubUsername, endYear);
        Object.assign(githubDays, res2.days || {});
      }
    } catch (err) {
      console.warn(`[getAlignedGrid] GitHub fetch warning for ${githubUsername}:`, err.message);
    }
  }

  // 2. Fetch local Git commits if requested
  let localCounts = {};
  if ((source === 'local' || source === 'both') && repoPath) {
    try {
      const y1 = startSun.toISOString().substring(0, 10);
      const y2 = endSat.toISOString().substring(0, 10);
      localCounts = await getDailyCommitCounts(repoPath, null, y1, y2);
    } catch (err) {
      console.warn('[getAlignedGrid] Local git history warning:', err.message);
    }
  }

  // 3. Build weeks and columns
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabels = [];
  const recordedMonths = new Set();

  const gridWeeks = [];
  let currentDate = new Date(startSun);

  for (let c = 0; c < numWeeks; c++) {
    const weekDays = [];
    for (let r = 0; r < 7; r++) {
      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, '0');
      const d = String(currentDate.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;

      const ghItem = githubDays[dateKey] || null;
      const ghCount = ghItem ? ghItem.count : 0;
      const ghLevel = ghItem ? ghItem.level : getIntensityLevel(ghCount);

      const locCount = localCounts[dateKey] || 0;
      const locLevel = getIntensityLevel(locCount);

      let existingCount = 0;
      let existingLevel = 0;

      if (source === 'github') {
        existingCount = ghCount;
        existingLevel = ghLevel;
      } else if (source === 'local') {
        existingCount = locCount;
        existingLevel = locLevel;
      } else {
        // 'both': combined
        existingCount = Math.max(ghCount, locCount);
        existingLevel = Math.max(ghLevel, locLevel);
      }

      const dayObj = {
        date: dateKey,
        col: c,
        row: r,
        dayOfWeek: r,
        dayOfMonth: currentDate.getDate(),
        month: currentDate.getMonth(),
        year: currentDate.getFullYear(),
        existingCount,
        existingLevel,
        githubCount: ghCount,
        localCount: locCount,
        tooltip: ghItem?.tooltip || `${existingCount} contribution(s) on ${dateKey}`
      };

      weekDays.push(dayObj);

      // Month label detection (placed at top of column)
      if (r === 0 || dayObj.dayOfMonth === 1) {
        const monthKey = `${dayObj.year}-${dayObj.month}`;
        if (!recordedMonths.has(monthKey)) {
          monthLabels.push({
            colIndex: c,
            label: monthNames[dayObj.month]
          });
          recordedMonths.add(monthKey);
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
    gridWeeks.push(weekDays);
  }

  return {
    source,
    githubUsername,
    startDate: startSun.toISOString().substring(0, 10),
    endDate: endSat.toISOString().substring(0, 10),
    weeksCount: numWeeks,
    weeks: gridWeeks,
    monthLabels,
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  };
}

module.exports = {
  getIntensityLevel,
  getContributionCalendar,
  getAlignedGrid
};
