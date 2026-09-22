/**
 * gitHistory.js
 * 
 * Reads and parses actual Git commit history from the target repository.
 * Never fakes history and never stores actual history in JSON.
 */

const { runGit } = require('./gitReader');

// Delimiters for reliable parsing across multiline commit messages
const FIELD_SEP = '||__GIT_FIELD__||';
const COMMIT_SEP = '||__GIT_COMMIT_END__||';

/**
 * Reads all commits or filtered commits from the target repository.
 * 
 * Git command:
 * `git log --format="format:%H%x00%h%x00%an%x00%ae%x00%ad%x00%aI%x00%cn%x00%ce%x00%cd%x00%cI%x00%s%x00%b" --date=iso`
 * 
 * @param {string} repoPath - Path to target git repository
 * @param {object} options - Optional filters: { limit, author, search, startDate, endDate, branch }
 * @returns {Promise<{ commits: Array, totalCommits: number, dailyTotals: object }>}
 */
async function getCommitHistory(repoPath, options = {}) {
  try {
    const { limit = 500, author = '', search = '', startDate = '', endDate = '', branch = '' } = options;

    // Build format string using null byte (\x00) for internal fields and COMMIT_SEP as record delimiter
    const format = `%H%x00%h%x00%an%x00%ae%x00%ad%x00%aI%x00%cn%x00%ce%x00%cd%x00%cI%x00%s%x00%b${COMMIT_SEP}`;

    const args = ['log', `--format=${format}`, '--date=iso'];

    if (limit && Number(limit) > 0) {
      args.push(`-n`, String(limit));
    }

    if (author) {
      args.push(`--author=${author}`);
    }

    if (search) {
      args.push(`--grep=${search}`);
    }

    if (startDate) {
      args.push(`--since=${startDate}`);
    }

    if (endDate) {
      // Add one day or end of day to include full endDate
      args.push(`--until=${endDate} 23:59:59`);
    }

    if (branch) {
      args.push(branch);
    }

    const { stdout } = await runGit(args, repoPath);
    if (!stdout || stdout.trim() === '') {
      return { commits: [], totalCommits: 0, dailyTotals: {} };
    }

    const rawRecords = stdout.split(COMMIT_SEP).map(r => r.trim()).filter(Boolean);
    const commits = [];
    const dailyTotals = {};

    for (const record of rawRecords) {
      const parts = record.split('\x00');
      if (parts.length < 11) continue;

      const [
        hash,
        shortHash,
        authorName,
        authorEmail,
        authorDateFormatted,
        authorDateIso,
        committerName,
        committerEmail,
        committerDateFormatted,
        committerDateIso,
        subject,
        body = ''
      ] = parts;

      // Extract ISO Date YYYY-MM-DD for grouping
      const dateOnly = authorDateIso ? authorDateIso.substring(0, 10) : '';

      const commitItem = {
        hash,
        shortHash,
        authorName,
        authorEmail,
        authorDate: authorDateFormatted,
        authorDateIso,
        dateOnly,
        committerName,
        committerEmail,
        committerDate: committerDateFormatted,
        committerDateIso,
        subject: subject ? subject.trim() : 'No commit message',
        body: body ? body.trim() : ''
      };

      commits.push(commitItem);

      if (dateOnly) {
        dailyTotals[dateOnly] = (dailyTotals[dateOnly] || 0) + 1;
      }
    }

    return {
      commits,
      totalCommits: commits.length,
      dailyTotals
    };
  } catch (err) {
    // If the repository has 0 commits, `git log` returns error (fatal: your current branch does not have any commits yet)
    if (err.stderr && (err.stderr.includes('does not have any commits') || err.stderr.includes('fatal: bad default revision'))) {
      return { commits: [], totalCommits: 0, dailyTotals: {} };
    }
    throw err;
  }
}

/**
 * Gets aggregated daily commit counts for a given year or date range.
 * Used to construct the real Git contribution calendar.
 * 
 * @param {string} repoPath 
 * @param {number|string} year 
 * @returns {Promise<object>} Map of `YYYY-MM-DD` => count
 */
async function getDailyCommitCounts(repoPath, year = null, startDate = null, endDate = null) {
  try {
    const args = ['log', '--format=%aI'];
    if (startDate && endDate) {
      args.push(`--since=${startDate} 00:00:00`);
      args.push(`--until=${endDate} 23:59:59`);
    } else if (year) {
      args.push(`--since=${year}-01-01 00:00:00`);
      args.push(`--until=${year}-12-31 23:59:59`);
    }

    const { stdout } = await runGit(args, repoPath);
    if (!stdout || stdout.trim() === '') {
      return {};
    }

    const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
    const counts = {};

    for (const line of lines) {
      // line is e.g. "2026-09-15T14:30:00+06:00"
      const dateOnly = line.substring(0, 10);
      if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
        counts[dateOnly] = (counts[dateOnly] || 0) + 1;
      }
    }

    return counts;
  } catch (err) {
    return {};
  }
}

/**
 * Retrieves all unique authors found in the Git repository history.
 * 
 * @param {string} repoPath 
 * @returns {Promise<Array<{ name: string, email: string, commitCount: number }>>}
 */
async function getUniqueAuthors(repoPath) {
  try {
    const { stdout } = await runGit(['log', '--format=%an%x00%ae'], repoPath);
    if (!stdout) return [];

    const map = new Map();
    stdout.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      const [name, email] = line.split('\x00');
      const key = `${name} <${email}>`;
      if (!map.has(key)) {
        map.set(key, { name, email, commitCount: 0 });
      }
      map.get(key).commitCount++;
    });

    return Array.from(map.values());
  } catch (err) {
    return [];
  }
}

module.exports = {
  getCommitHistory,
  getDailyCommitCounts,
  getUniqueAuthors
};
