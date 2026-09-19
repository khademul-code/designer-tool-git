/**
 * gitWriter.js
 * 
 * Safe Git execution layer for writing commits, synchronizing with remotes,
 * and performing controlled history operations on the disposable test repository.
 */

const { execFile } = require('child_process');
const { runGit } = require('./gitReader');

/**
 * Executes a Git command with custom environment variables (e.g. for author and committer dates).
 * 
 * @param {string[]} args 
 * @param {string} cwd 
 * @param {object} customEnv 
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function runGitWithEnv(args, cwd = process.cwd(), customEnv = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...customEnv };
    execFile('git', args, { cwd, env, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr ? stderr.trim() : '';
        error.stdout = stdout ? stdout.trim() : '';
        return reject(error);
      }
      resolve({
        stdout: stdout ? stdout.trim() : '',
        stderr: stderr ? stderr.trim() : ''
      });
    });
  });
}

/**
 * Creates a single real Git commit with specified timestamp and author.
 * 
 * Git concepts demonstrated:
 * 1. `GIT_AUTHOR_DATE`: sets the timestamp when author wrote the code.
 * 2. `GIT_COMMITTER_DATE`: sets the timestamp when commit was recorded into the repository.
 * 3. `--allow-empty`: enables creating real learning commits without modifying files.
 * 4. `--author`: explicitly sets the author identity for this commit.
 * 
 * @param {string} repoPath 
 * @param {object} commitDetails - { dateIso, message, authorName, authorEmail }
 * @returns {Promise<{ hash: string, shortHash: string, date: string, message: string }>}
 */
async function createSingleCommit(repoPath, commitDetails) {
  const {
    dateIso, // e.g. "2026-09-15T14:30:00+06:00" or "2026-09-15 14:30:00"
    message = 'Git learning commit',
    authorName = 'Git Learner',
    authorEmail = 'learner@example.com'
  } = commitDetails;

  const authorString = `${authorName.trim()} <${authorEmail.trim()}>`;

  // Provide both author and committer environment overrides for realistic timestamping
  const envOverrides = {
    GIT_AUTHOR_DATE: dateIso,
    GIT_COMMITTER_DATE: dateIso
  };

  const args = [
    'commit',
    '--allow-empty',
    `-m`, message,
    `--author=${authorString}`
  ];

  await runGitWithEnv(args, repoPath, envOverrides);

  // Retrieve the newly created commit hash (HEAD)
  const { stdout: hash } = await runGit(['rev-parse', 'HEAD'], repoPath);
  const { stdout: shortHash } = await runGit(['rev-parse', '--short', 'HEAD'], repoPath);

  return {
    hash: hash.trim(),
    shortHash: shortHash.trim(),
    date: dateIso,
    message,
    author: authorString
  };
}

/**
 * Creates a batch of real Git commits across multiple dates or counts.
 * Includes a safety limit (max 500 per batch) to prevent infinite loops.
 * 
 * @param {string} repoPath 
 * @param {Array<{ date: string, time?: string, count: number, message?: string, authorName?: string, authorEmail?: string }>} commitPlan
 * @returns {Promise<{ createdCount: number, commits: Array }>}
 */
async function createBatchCommits(repoPath, commitPlan) {
  const MAX_BATCH_COMMITS = 500;
  
  // Calculate total requested commits
  let totalRequested = 0;
  commitPlan.forEach(item => {
    totalRequested += Math.max(0, parseInt(item.count, 10) || 0);
  });

  if (totalRequested > MAX_BATCH_COMMITS) {
    throw new Error(`Safety limit exceeded: Requested ${totalRequested} commits. Max allowed in a single batch is ${MAX_BATCH_COMMITS}.`);
  }

  const createdCommits = [];

  for (const item of commitPlan) {
    const count = parseInt(item.count, 10) || 0;
    if (count <= 0) continue;

    const baseDate = item.date; // e.g. "2026-09-15"
    const baseTime = item.time || '12:00:00';
    const message = item.message || 'Git learning commit';
    const authorName = item.authorName || 'Git Learner';
    const authorEmail = item.authorEmail || 'learner@example.com';

    for (let i = 0; i < count; i++) {
      // Stagger timestamps by minutes/seconds if multiple commits on same day
      const dateObj = new Date(`${baseDate}T${baseTime}`);
      // Add minutes offset for realistic sequential commits
      dateObj.setMinutes(dateObj.getMinutes() + i * 5);
      const dateIso = dateObj.toISOString();

      const commitResult = await createSingleCommit(repoPath, {
        dateIso,
        message: count > 1 ? `${message} (#${i + 1}/${count})` : message,
        authorName,
        authorEmail
      });

      createdCommits.push(commitResult);
    }
  }

  return {
    createdCount: createdCommits.length,
    commits: createdCommits
  };
}

/**
 * Pulls changes from configured remote repository.
 * 
 * Git command: `git pull <remoteName> <branchName>`
 * 
 * @param {string} repoPath 
 * @param {string} remoteName 
 * @param {string} branchName 
 * @returns {Promise<{ success: boolean, output: string }>}
 */
async function pullFromRemote(repoPath, remoteName = 'origin', branchName = 'main') {
  try {
    const { stdout, stderr } = await runGit(['pull', remoteName, branchName], repoPath);
    return {
      success: true,
      output: stdout || stderr || 'Pull completed successfully.'
    };
  } catch (err) {
    throw new Error(`Git Pull Failed: ${err.stderr || err.message}`);
  }
}

/**
 * Pushes commits to configured remote repository.
 * Requires explicit confirmation from UI before invocation.
 * 
 * Git command: `git push <remoteName> <branchName>` or `git push <remoteName> <branchName> --force`
 * 
 * @param {string} repoPath 
 * @param {string} remoteName 
 * @param {string} branchName 
 * @param {boolean} force - Whether to force push (strictly controlled)
 * @returns {Promise<{ success: boolean, output: string }>}
 */
async function pushToRemote(repoPath, remoteName = 'origin', branchName = 'main', force = false) {
  try {
    const args = ['push', remoteName, branchName];
    if (force) {
      args.push('--force');
    }

    const { stdout, stderr } = await runGit(args, repoPath);
    return {
      success: true,
      output: stdout || stderr || 'Push completed successfully.'
    };
  } catch (err) {
    throw new Error(`Git Push Failed: ${err.stderr || err.message}`);
  }
}

/**
 * Checks how many commits are unpushed relative to upstream tracking branch.
 * 
 * Git command: `git rev-list --count @{u}..HEAD` or fallback to `<remote>/<branch>..HEAD`
 * 
 * @param {string} repoPath 
 * @param {string} remoteName 
 * @param {string} branchName 
 * @returns {Promise<{ unpushedCount: number, trackingBranch: string, error?: string }>}
 */
async function getUnpushedCommitCount(repoPath, remoteName = 'origin', branchName = 'main') {
  try {
    // 1. Try standard upstream tracking check
    const { stdout } = await runGit(['rev-list', '--count', '@{u}..HEAD'], repoPath).catch(async () => {
      // Fallback: check remote branch explicitly
      return await runGit(['rev-list', '--count', `${remoteName}/${branchName}..HEAD`], repoPath);
    });

    const count = parseInt(stdout, 10);
    return {
      unpushedCount: isNaN(count) ? 0 : count,
      trackingBranch: `${remoteName}/${branchName}`
    };
  } catch (err) {
    // No remote tracking branch setup yet
    return {
      unpushedCount: 0,
      trackingBranch: 'None',
      error: 'No upstream tracking branch configured or repository has no remote.'
    };
  }
}

/**
 * Controlled History Management: Resets the last N commits.
 * 
 * Git command: `git reset --hard HEAD~N` or `git reset --soft HEAD~N`
 * 
 * @param {string} repoPath 
 * @param {number} count - Number of commits to remove
 * @param {boolean} hard - If true, resets working tree (hard reset)
 * @returns {Promise<{ success: boolean, message: string, currentHead: string }>}
 */
async function resetLastCommits(repoPath, count = 1, hard = true) {
  const num = parseInt(count, 10);
  if (isNaN(num) || num <= 0) {
    throw new Error('Invalid commit count for reset operation.');
  }

  const mode = hard ? '--hard' : '--soft';
  const target = `HEAD~${num}`;

  await runGit(['reset', mode, target], repoPath);
  const { stdout: newHead } = await runGit(['rev-parse', '--short', 'HEAD'], repoPath).catch(() => ({ stdout: 'None' }));

  return {
    success: true,
    message: `Successfully reset last ${num} commit(s) using "git reset ${mode} ${target}".`,
    currentHead: newHead.trim()
  };
}

/**
 * Resets disposable test branch to an empty/initial state.
 * 
 * @param {string} repoPath 
 * @param {string} branchName 
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function resetTestBranch(repoPath, branchName = 'main') {
  try {
    // Checkout an orphan branch or reset HEAD
    await runGit(['checkout', '--orphan', `temp_orphan_${Date.now()}`], repoPath);
    await runGit(['rm', '-rf', '.'], repoPath).catch(() => {});
    await runGit(['branch', '-D', branchName], repoPath).catch(() => {});
    await runGit(['checkout', '-b', branchName], repoPath);

    return {
      success: true,
      message: `Branch "${branchName}" has been reset to a fresh empty state.`
    };
  } catch (err) {
    throw new Error(`Failed to reset test branch: ${err.stderr || err.message}`);
  }
}

/**
 * Removes Git commits whose author date falls within the given date range.
 * 
 * Strategy: Read all commits oldest→newest, identify commits to REMOVE (within range),
 * then use git filter-branch --commit-filter to skip those commits by hash.
 * This rewrites all commit SHAs after the first removed commit (expected for history rewriting).
 * 
 * Cross-platform safe: uses child_process.execFile; no shell injection.
 * 
 * @param {string} repoPath
 * @param {string} startDate - "YYYY-MM-DD" inclusive
 * @param {string} endDate   - "YYYY-MM-DD" inclusive
 * @returns {Promise<{ removedCount: number, keptCount: number, originalHead: string, newHead: string }>}
 */
async function removeCommitsByDateRange(repoPath, startDate, endDate) {
  // 1. Get all commit hashes with their author ISO dates (oldest first)
  const { stdout } = await runGit(
    ['log', '--format=%H%x00%aI', '--reverse'],
    repoPath
  );

  if (!stdout || !stdout.trim()) {
    return { removedCount: 0, keptCount: 0, originalHead: '', newHead: '' };
  }

  // 2. Build sets of hashes to remove
  const start = new Date(startDate + 'T00:00:00');
  const end   = new Date(endDate   + 'T23:59:59');

  const allLines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  const hashesToRemove = new Set();
  let keptCount = 0;

  for (const line of allLines) {
    const [hash, isoDate] = line.split('\x00');
    if (!hash || !isoDate) continue;
    const commitDate = new Date(isoDate);
    if (commitDate >= start && commitDate <= end) {
      hashesToRemove.add(hash);
    } else {
      keptCount++;
    }
  }

  if (hashesToRemove.size === 0) {
    // Nothing to remove
    const { stdout: head } = await runGit(['rev-parse', 'HEAD'], repoPath);
    return { removedCount: 0, keptCount, originalHead: head.trim(), newHead: head.trim() };
  }

  const { stdout: originalHead } = await runGit(['rev-parse', 'HEAD'], repoPath);
  const { stdout: currentBranch } = await runGit(['branch', '--show-current'], repoPath);
  const branchName = currentBranch.trim() || 'main';

  // 3. Create a scratch file with hashes to remove (so we don't need shell eval)
  //    We will use git filter-branch with --commit-filter that reads a temp env var.
  //    However, filter-branch needs shell on Windows, which is tricky.
  //    Instead: cherry-pick approach — build new history on orphan branch.

  const orphanBranch = `__v2_rebuild_${Date.now()}`;

  // 3a. Create orphan branch (no history)
  await runGit(['checkout', '--orphan', orphanBranch], repoPath);
  // Clear index
  await runGit(['rm', '-rf', '--cached', '.'], repoPath).catch(() => {});
  // Remove working tree files if any (allow-empty repos typically have none)
  const { execFile } = require('child_process');

  // 3b. Cherry-pick all commits NOT in removal set, in order oldest→newest
  const keptHashes = allLines
    .map(l => l.split('\x00')[0])
    .filter(h => h && !hashesToRemove.has(h));

  let firstCommit = true;
  for (const hash of keptHashes) {
    if (firstCommit) {
      // Cherry-pick the first kept commit as a root commit using cherry-pick with --allow-empty
      // We need to get the commit details and re-create it
      const fmt = '%H%x00%an%x00%ae%x00%aI%x00%s';
      const { stdout: info } = await runGit(['log', '-1', `--format=${fmt}`, hash], repoPath);
      const parts = info.trim().split('\x00');
      const [, authorName, authorEmail, authorDate, subject] = parts;

      const env = {
        GIT_AUTHOR_NAME:     authorName || 'Git User',
        GIT_AUTHOR_EMAIL:    authorEmail || 'user@example.com',
        GIT_AUTHOR_DATE:     authorDate,
        GIT_COMMITTER_NAME:  authorName || 'Git User',
        GIT_COMMITTER_EMAIL: authorEmail || 'user@example.com',
        GIT_COMMITTER_DATE:  authorDate
      };

      await runGitWithEnv(
        ['commit', '--allow-empty', '-m', subject || 'commit'],
        repoPath,
        env
      );
      firstCommit = false;
    } else {
      // Cherry-pick subsequent commits
      // Get details for preserving author info and dates
      const fmt = '%H%x00%an%x00%ae%x00%aI%x00%s';
      const { stdout: info } = await runGit(['log', '-1', `--format=${fmt}`, hash], repoPath);
      const parts = info.trim().split('\x00');
      const [, authorName, authorEmail, authorDate, subject] = parts;

      const env = {
        GIT_AUTHOR_NAME:     authorName || 'Git User',
        GIT_AUTHOR_EMAIL:    authorEmail || 'user@example.com',
        GIT_AUTHOR_DATE:     authorDate,
        GIT_COMMITTER_NAME:  authorName || 'Git User',
        GIT_COMMITTER_EMAIL: authorEmail || 'user@example.com',
        GIT_COMMITTER_DATE:  authorDate
      };

      await runGitWithEnv(
        ['cherry-pick', '--allow-empty', '--allow-empty-message', '--no-commit', hash],
        repoPath,
        env
      ).catch(() => {});

      // Commit with original metadata
      await runGitWithEnv(
        ['commit', '--allow-empty', '-m', subject || 'commit'],
        repoPath,
        env
      );
    }
  }

  // 3c. If no commits were kept, we need at least an empty state
  // The orphan branch now has the rebuilt history (or is empty)

  // 3d. Force-reset the original branch to orphan branch HEAD
  let newHead = '';
  try {
    const { stdout: orphanHead } = await runGit(['rev-parse', 'HEAD'], repoPath);
    newHead = orphanHead.trim();
  } catch {
    newHead = '';
  }

  // Switch back to original branch and hard-reset to new history
  await runGit(['checkout', '-B', branchName, orphanBranch], repoPath);

  // Delete the temp orphan branch
  await runGit(['branch', '-D', orphanBranch], repoPath).catch(() => {});

  return {
    removedCount: hashesToRemove.size,
    keptCount,
    originalHead: originalHead.trim(),
    newHead
  };
}

module.exports = {
  createSingleCommit,
  createBatchCommits,
  pullFromRemote,
  pushToRemote,
  getUnpushedCommitCount,
  resetLastCommits,
  resetTestBranch,
  removeCommitsByDateRange
};
