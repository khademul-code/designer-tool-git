/**
 * repositoryService.js
 * 
 * Manages repository configuration settings and aggregates real-time Git status.
 */

const path = require('path');
const { readJsonFile, writeJsonFile } = require('../utils/fileStore');
const gitReader = require('../git/gitReader');
const gitWriter = require('../git/gitWriter');

const SETTINGS_PATH = path.join(__dirname, '../../data/settings.json');

const DEFAULT_SETTINGS = {
  repositoryPath: '',
  defaultCommitMessage: 'Git learning commit',
  defaultBranch: 'main',
  remoteName: 'origin',
  authorName: 'Khademul Islam',
  authorEmail: 'khadimulmanaliam@gmail.com'
};

/**
 * Returns the currently saved settings.
 */
function getSettings() {
  const settings = readJsonFile(SETTINGS_PATH, DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...settings };
}

/**
 * Updates application settings.
 * 
 * @param {object} newSettings 
 * @returns {object} Updated settings
 */
function updateSettings(newSettings) {
  const current = getSettings();
  const updated = {
    ...current,
    ...newSettings
  };
  writeJsonFile(SETTINGS_PATH, updated);
  return updated;
}

/**
 * Validates a repository path.
 * 
 * @param {string} targetPath 
 */
async function validatePath(targetPath) {
  return await gitReader.validateRepositoryDirectory(targetPath);
}

/**
 * Retrieves all branches in the target repository.
 * 
 * @param {string} repoPath 
 */
async function getBranches(repoPath) {
  try {
    const { stdout } = await gitReader.runGit(['branch', '--list', '--all'], repoPath);
    if (!stdout) return [];
    
    return stdout.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const isCurrent = line.startsWith('*');
      const name = line.replace(/^\*\s*/, '').trim();
      const isRemote = name.startsWith('remotes/');
      return {
        name,
        isCurrent,
        isRemote
      };
    });
  } catch (err) {
    return [];
  }
}

/**
 * Retrieves the full live status of the configured repository.
 */
async function getFullRepositoryStatus() {
  const gitCheck = await gitReader.checkGitInstalled();
  const settings = getSettings();
  const repoPath = settings.repositoryPath ? settings.repositoryPath.trim() : '';

  const statusReport = {
    gitInstalled: gitCheck.installed,
    gitVersion: gitCheck.version,
    gitError: gitCheck.error || null,
    settings: {
      repositoryPath: repoPath,
      defaultCommitMessage: settings.defaultCommitMessage,
      defaultBranch: settings.defaultBranch,
      remoteName: settings.remoteName,
      authorName: settings.authorName,
      authorEmail: settings.authorEmail
    },
    validation: {
      isConfigured: Boolean(repoPath),
      isValid: false,
      exists: false,
      isDirectory: false,
      isGitRepo: false,
      message: repoPath ? '' : 'No target repository path has been configured yet.'
    },
    git: {
      branch: 'N/A',
      isClean: false,
      rawStatus: '',
      modifiedCount: 0,
      untrackedCount: 0,
      hasOriginRemote: false,
      remoteUrl: '',
      remotes: [],
      branches: [],
      unpushedCommits: 0,
      trackingBranch: 'None',
      totalCommits: 0,
      lastCommit: null
    }
  };

  if (!gitCheck.installed) {
    statusReport.validation.message = gitCheck.error;
    return statusReport;
  }

  if (!repoPath) {
    return statusReport;
  }

  // Validate the directory
  const validation = await gitReader.validateRepositoryDirectory(repoPath);
  statusReport.validation = {
    isConfigured: true,
    ...validation
  };

  if (!validation.isValid) {
    return statusReport;
  }

  // Target directory is a valid Git repository -> gather Git metadata
  try {
    const [branch, workingTree, remotes, branches, totalCommits, lastCommit] = await Promise.all([
      gitReader.getCurrentBranch(repoPath),
      gitReader.getWorkingTreeStatus(repoPath),
      gitReader.getRemotes(repoPath),
      getBranches(repoPath),
      gitReader.getTotalCommitCount(repoPath),
      gitReader.getLastCommitInfo(repoPath)
    ]);

    const targetRemote = remotes.find(r => r.name === settings.remoteName && r.type === 'push') 
      || remotes.find(r => r.name === settings.remoteName) 
      || remotes[0];

    // Check unpushed commits count
    const syncInfo = await gitWriter.getUnpushedCommitCount(repoPath, settings.remoteName, branch);

    statusReport.git = {
      branch,
      isClean: workingTree.isClean,
      rawStatus: workingTree.rawStatus,
      modifiedCount: workingTree.modifiedCount,
      untrackedCount: workingTree.untrackedCount,
      hasOriginRemote: Boolean(targetRemote),
      remoteUrl: targetRemote ? targetRemote.url : '',
      remotes,
      branches,
      unpushedCommits: syncInfo.unpushedCount || 0,
      trackingBranch: syncInfo.trackingBranch || 'None',
      totalCommits,
      lastCommit
    };
  } catch (err) {
    statusReport.validation.message = `Error reading repository metadata: ${err.message}`;
  }

  return statusReport;
}

module.exports = {
  getSettings,
  updateSettings,
  validatePath,
  getBranches,
  getFullRepositoryStatus
};
