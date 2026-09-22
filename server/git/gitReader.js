/**
 * gitReader.js
 * 
 * Safe Git CLI execution layer for reading Git metadata and status.
 * Uses child_process.execFile (NOT shell concatenation) to prevent command injection.
 * 
 * Explains Git internals and command outputs for educational clarity.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Helper to execute a Git command safely.
 * 
 * @param {string[]} args - Array of command-line arguments for git (e.g. ['status', '--short'])
 * @param {string} cwd - Directory to execute the command in
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function runGit(args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        // Attach standard error output for better diagnostic messages
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
 * Checks if Git is installed and accessible in the system PATH.
 * 
 * Command: `git --version`
 * Why: Verifies that the host machine has the Git CLI installed.
 * 
 * @returns {Promise<{ installed: boolean, version: string, error?: string }>}
 */
async function checkGitInstalled() {
  try {
    const { stdout } = await runGit(['--version']);
    return {
      installed: true,
      version: stdout // e.g. "git version 2.43.0.windows.1"
    };
  } catch (err) {
    return {
      installed: false,
      version: '',
      error: 'Git was not found on this machine. Install Git and make sure it is available in PATH.'
    };
  }
}

/**
 * Verifies if a given directory path exists, is a folder, and is a valid Git repository.
 * 
 * Command: `git rev-parse --is-inside-work-tree`
 * Why: Checks if the target folder has a initialized Git working tree (i.e. contains a valid .git directory).
 * 
 * @param {string} repoPath - Absolute path to target folder
 * @returns {Promise<{ isValid: boolean, exists: boolean, isDirectory: boolean, isGitRepo: boolean, message: string }>}
 */
async function validateRepositoryDirectory(repoPath) {
  if (!repoPath || typeof repoPath !== 'string' || repoPath.trim() === '') {
    return {
      isValid: false,
      exists: false,
      isDirectory: false,
      isGitRepo: false,
      message: 'Repository path cannot be empty.'
    };
  }

  const normalizedPath = path.normalize(repoPath.trim());

  // 1. Check if path exists on the filesystem
  if (!fs.existsSync(normalizedPath)) {
    return {
      isValid: false,
      exists: false,
      isDirectory: false,
      isGitRepo: false,
      message: `Path does not exist: "${normalizedPath}"`
    };
  }

  // 2. Check if the path is a directory (not a file)
  try {
    const stats = fs.statSync(normalizedPath);
    if (!stats.isDirectory()) {
      return {
        isValid: false,
        exists: true,
        isDirectory: false,
        isGitRepo: false,
        message: `Path exists, but is a file, not a directory: "${normalizedPath}"`
      };
    }
  } catch (err) {
    return {
      isValid: false,
      exists: true,
      isDirectory: false,
      isGitRepo: false,
      message: `Failed to inspect path: ${err.message}`
    };
  }

  // 3. Verify it is a Git repository using Git's own internal check
  try {
    const { stdout } = await runGit(['rev-parse', '--is-inside-work-tree'], normalizedPath);
    if (stdout === 'true') {
      return {
        isValid: true,
        exists: true,
        isDirectory: true,
        isGitRepo: true,
        message: 'Valid Git repository.'
      };
    }
  } catch (err) {
    return {
      isValid: false,
      exists: true,
      isDirectory: true,
      isGitRepo: false,
      message: `Directory is not a Git repository. To initialize it, run "git init" inside "${normalizedPath}".`
    };
  }

  return {
    isValid: false,
    exists: true,
    isDirectory: true,
    isGitRepo: false,
    message: 'Directory is not a Git repository.'
  };
}

/**
 * Gets the currently checked-out branch name.
 * 
 * Command: `git branch --show-current`
 * Why: Returns the active branch (e.g. "main" or "master").
 * If the repo is brand new and has no commits yet, Git might return empty or "main".
 * 
 * @param {string} repoPath 
 * @returns {Promise<string>} Branch name or "HEAD (unborn)" if empty
 */
async function getCurrentBranch(repoPath) {
  try {
    const { stdout } = await runGit(['branch', '--show-current'], repoPath);
    if (stdout) {
      return stdout;
    }
    // For newly initialized empty repository or detached HEAD:
    const symbolic = await runGit(['symbolic-ref', '--short', 'HEAD'], repoPath).catch(() => ({ stdout: '' }));
    return symbolic.stdout || 'main (initial)';
  } catch (err) {
    return 'unknown';
  }
}

/**
 * Reads the working tree and staging status.
 * 
 * Command: `git status --short --branch`
 * Why: Provides a compact status of modified, untracked, or staged files,
 * as well as tracking status relative to upstream (e.g. [ahead 1]).
 * 
 * @param {string} repoPath 
 * @returns {Promise<{ isClean: boolean, rawStatus: string, modifiedCount: number, untrackedCount: number }>}
 */
async function getWorkingTreeStatus(repoPath) {
  try {
    const { stdout } = await runGit(['status', '--short'], repoPath);
    const lines = stdout ? stdout.split('\n').filter(Boolean) : [];
    
    let untrackedCount = 0;
    let modifiedCount = 0;

    lines.forEach(line => {
      if (line.startsWith('??')) {
        untrackedCount++;
      } else {
        modifiedCount++;
      }
    });

    return {
      isClean: lines.length === 0,
      rawStatus: stdout,
      fileCount: lines.length,
      modifiedCount,
      untrackedCount
    };
  } catch (err) {
    return {
      isClean: true,
      rawStatus: '',
      fileCount: 0,
      modifiedCount: 0,
      untrackedCount: 0,
      error: err.message
    };
  }
}

/**
 * Reads configured remote repositories.
 * 
 * Command: `git remote -v`
 * Why: Inspects where this repository can push/fetch (e.g. GitHub URL).
 * 
 * @param {string} repoPath 
 * @returns {Promise<Array<{ name: string, url: string, type: 'fetch'|'push' }>>}
 */
async function getRemotes(repoPath) {
  try {
    const { stdout } = await runGit(['remote', '-v'], repoPath);
    if (!stdout) return [];

    const lines = stdout.split('\n').filter(Boolean);
    const remotesMap = new Map();

    lines.forEach(line => {
      // Format: origin  https://github.com/user/repo.git (fetch)
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (match) {
        const [, name, url, type] = match;
        const key = `${name}_${type}`;
        remotesMap.set(key, { name, url, type });
      }
    });

    return Array.from(remotesMap.values());
  } catch (err) {
    return [];
  }
}

/**
 * Counts total commits in the current branch.
 * 
 * Command: `git rev-list --count HEAD`
 * Why: Fast and accurate count of commits reachable from HEAD.
 * Returns 0 if the repository has no commits yet.
 * 
 * @param {string} repoPath 
 * @returns {Promise<number>}
 */
async function getTotalCommitCount(repoPath) {
  try {
    const { stdout } = await runGit(['rev-list', '--count', 'HEAD'], repoPath);
    const count = parseInt(stdout, 10);
    return isNaN(count) ? 0 : count;
  } catch (err) {
    // If the repo is brand new and has no commits yet, HEAD cannot be resolved
    return 0;
  }
}

/**
 * Retrieves the latest commit information.
 * 
 * Command: `git log -1 --format=...`
 * Why: Inspects the most recent commit hash, author, date, and commit message.
 * Returns null if the repository has no commits yet.
 * 
 * @param {string} repoPath 
 * @returns {Promise<object|null>}
 */
async function getLastCommitInfo(repoPath) {
  try {
    // Format: Hash%x1fAuthor%x1fEmail%x1fAuthorDate%x1fSubject
    const format = '%H%x1f%an%x1f%ae%x1f%ai%x1f%s';
    const { stdout } = await runGit(['log', '-1', `--format=${format}`], repoPath);
    if (!stdout) return null;

    const parts = stdout.split('\x1f');
    if (parts.length < 5) return null;

    return {
      hash: parts[0],
      shortHash: parts[0].substring(0, 7),
      authorName: parts[1],
      authorEmail: parts[2],
      authorDate: parts[3],
      message: parts[4]
    };
  } catch (err) {
    return null; // Empty repo or no commits
  }
}

/**
 * Scans commits on the current or specified branch, inspecting tree hashes
 * to classify each commit as empty (0 file changes, contribution placeholder)
 * vs real code commit (modified files).
 * 
 * @param {string} repoPath 
 * @param {object} options - { startDate, endDate, branch }
 * @returns {Promise<{ emptyCommits: Array, codeCommits: Array, totalCount: number }>}
 */
async function scanCommitsWithTree(repoPath, options = {}) {
  const { startDate, endDate, branch } = options;
  const targetBranch = branch || await getCurrentBranch(repoPath).catch(() => 'HEAD');

  // Format: %H%x00%P%x00%T%x00%an%x00%ae%x00%aI%x00%s
  const fmt = '%H%x00%P%x00%T%x00%an%x00%ae%x00%aI%x00%s';
  const args = ['log', `--format=${fmt}`, '--reverse'];
  if (targetBranch && targetBranch !== 'unknown') {
    args.push(targetBranch);
  }

  const { stdout } = await runGit(args, repoPath).catch(() => ({ stdout: '' }));
  if (!stdout || !stdout.trim()) {
    return { emptyCommits: [], codeCommits: [], totalCount: 0 };
  }

  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  const commitMap = new Map();

  // First pass: index all commits by hash
  for (const line of lines) {
    const parts = line.split('\x00');
    if (parts.length < 7) continue;
    const [hash, parentsRaw, tree, authorName, authorEmail, authorDateIso, subject] = parts;
    const parents = parentsRaw.split(' ').filter(Boolean);
    commitMap.set(hash, {
      hash,
      shortHash: hash.substring(0, 7),
      parents,
      tree,
      authorName,
      authorEmail,
      authorDateIso,
      dateOnly: authorDateIso ? authorDateIso.substring(0, 10) : '',
      subject: subject ? subject.trim() : 'No commit message'
    });
  }

  // Second pass: determine isEmpty
  const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const start = startDate ? new Date(startDate + 'T00:00:00') : null;
  const end = endDate ? new Date(endDate + 'T23:59:59') : null;

  const emptyCommits = [];
  const codeCommits = [];

  for (const [hash, c] of commitMap.entries()) {
    let isEmpty = false;
    if (c.parents.length === 0) {
      // Root commit is empty only if its tree matches empty tree
      isEmpty = (c.tree === EMPTY_TREE_HASH);
    } else if (c.parents.length === 1) {
      const parentHash = c.parents[0];
      const parentCommit = commitMap.get(parentHash);
      if (parentCommit) {
        isEmpty = (c.tree === parentCommit.tree);
      } else {
        // Parent not in current log, query git rev-parse parent tree
        try {
          const { stdout: parentTree } = await runGit(['rev-parse', `${parentHash}^{tree}`], repoPath);
          isEmpty = (c.tree === parentTree.trim());
        } catch {
          isEmpty = false;
        }
      }
    } else {
      // Merge commit - not considered empty contribution commit
      isEmpty = false;
    }

    c.isEmpty = isEmpty;

    // Filter by date range if provided
    if (start && end) {
      const commitDate = new Date(c.authorDateIso);
      if (commitDate < start || commitDate > end) {
        continue; // Out of range
      }
    }

    if (isEmpty) {
      emptyCommits.push(c);
    } else {
      codeCommits.push(c);
    }
  }

  return {
    emptyCommits,
    codeCommits,
    totalCount: emptyCommits.length + codeCommits.length
  };
}

/**
 * Reads user.name and user.email configured in the repository or globally in Git.
 * 
 * @param {string} [repoPath] 
 * @returns {Promise<{ name: string, email: string }>}
 */
async function getGitUserConfig(repoPath) {
  const cwd = repoPath || process.cwd();
  let name = '';
  let email = '';

  try {
    const { stdout } = await runGit(['config', 'user.name'], cwd);
    name = stdout ? stdout.trim() : '';
  } catch (err) {
    // Unset or error
  }

  try {
    const { stdout } = await runGit(['config', 'user.email'], cwd);
    email = stdout ? stdout.trim() : '';
  } catch (err) {
    // Unset or error
  }

  return { name, email };
}

module.exports = {
  runGit,
  checkGitInstalled,
  validateRepositoryDirectory,
  getCurrentBranch,
  getWorkingTreeStatus,
  getRemotes,
  getTotalCommitCount,
  getLastCommitInfo,
  scanCommitsWithTree,
  getGitUserConfig
};
