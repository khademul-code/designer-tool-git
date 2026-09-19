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

  // Track month header labels
  const monthLabels = [];
  let lastMonth = -1;

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
      const firstDayOfWeek = currentWeek[0];
      const monthIndex = firstDayOfWeek.month;
      
      // Register month label if month changed
      if (monthIndex !== lastMonth && isWithinRange) {
        monthLabels.push({
          weekIndex: weeks.length,
          monthName: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(y, monthIndex, 1))
        });
        lastMonth = monthIndex;
      }

      weeks.push(currentWeek);
      currentWeek = [];
    }

    currentDate.setDate(currentDate.getDate() + 1);

    // Safety guard to avoid runaway loop
    if (weeks.length > 54) break;
  }

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

module.exports = {
  getIntensityLevel,
  getContributionCalendar
};
