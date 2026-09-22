/**
 * githubService.js
 * 
 * Fetches and parses public GitHub profile contribution calendars for any user.
 * Captures live activity across ALL repositories on the user's GitHub account.
 */

// Simple in-memory cache with 5-minute TTL to respect GitHub and keep UI fast
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetches the GitHub contribution calendar HTML fragment for a given user and year,
 * and parses it into a structured map of dates, counts, and intensity levels.
 * 
 * @param {string} username - GitHub username (e.g. "khademul-menaliam")
 * @param {number|string} [year] - Calendar year (e.g. 2026) or null for rolling year
 * @returns {Promise<{ username: string, year: number|null, totalContributions: number, days: object }>}
 */
async function fetchGithubUserContributions(username, year = null) {
  if (!username || typeof username !== 'string') {
    throw new Error('GitHub username is required.');
  }

  const cleanUser = username.trim();
  const cacheKey = `${cleanUser.toLowerCase()}_${year || 'current'}`;
  const cached = cache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  const url = year 
    ? `https://github.com/users/${encodeURIComponent(cleanUser)}/contributions?from=${year}-01-01&to=${year}-12-31`
    : `https://github.com/users/${encodeURIComponent(cleanUser)}/contributions`;

  const headers = {
    'User-Agent': 'Git-Contribution-Designer-Tool/1.0',
    'Accept': 'text/html,application/xhtml+xml',
    'Cache-Control': 'no-cache'
  };

  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`GitHub user "${cleanUser}" not found.`);
    }
    throw new Error(`GitHub request failed with HTTP ${res.status}`);
  }

  const html = await res.text();

  // 1. Extract tooltips by ID: <tool-tip for="ID">...</tool-tip>
  const tooltips = {};
  const ttRegex = /<tool-tip[^>]*for="([^"]+)"[^>]*>(.*?)<\/tool-tip>/gs;
  let ttMatch;
  while ((ttMatch = ttRegex.exec(html))) {
    tooltips[ttMatch[1]] = ttMatch[2].trim();
  }

  // 2. Extract calendar cells: <td ... data-date="YYYY-MM-DD" id="..." data-level="...">
  const tdRegex = /<td[^>]*data-date="([^"]+)"[^>]*id="([^"]+)"[^>]*data-level="([^"]+)"/g;
  let tdMatch;
  const days = {};
  let totalContributions = 0;

  while ((tdMatch = tdRegex.exec(html))) {
    const date = tdMatch[1];
    const id = tdMatch[2];
    const level = parseInt(tdMatch[3], 10) || 0;
    const ttText = tooltips[id] || '';
    
    let count = 0;
    const countMatch = ttText.match(/(\d+)\s+contribution/i);
    if (countMatch) {
      count = parseInt(countMatch[1], 10);
    } else if (level > 0) {
      // Fallback minimum based on level if text didn't match
      const levelDefaults = [0, 1, 3, 5, 8];
      count = levelDefaults[level] || 1;
    }

    days[date] = {
      date,
      level,
      count,
      tooltip: ttText || `${count} contribution${count !== 1 ? 's' : ''} on ${date}`
    };

    totalContributions += count;
  }

  const result = {
    username: cleanUser,
    year: year ? parseInt(year, 10) : null,
    totalContributions,
    daysCount: Object.keys(days).length,
    days
  };

  // Cache the result
  cache.set(cacheKey, {
    timestamp: Date.now(),
    data: result
  });

  return result;
}

/**
 * Clears the in-memory GitHub cache.
 */
function clearCache() {
  cache.clear();
}

module.exports = {
  fetchGithubUserContributions,
  clearCache
};
