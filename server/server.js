/**
 * server.js
 * 
 * Express application server for Git Contribution Designer & Git History Lab.
 * Local-first server providing REST APIs for learning Git internals,
 * reading real Git history, generating contribution calendars, designing patterns,
 * creating real dated commits, synchronizing with remotes, and controlled history management.
 */

const express = require('express');
const path = require('path');

const gitReader = require('./git/gitReader');
const gitWriter = require('./git/gitWriter');
const gitHistory = require('./git/gitHistory');

const repositoryService = require('./services/repositoryService');
const contributionService = require('./services/contributionService');
const designService = require('./services/designService');
const planService = require('./services/planService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

/**
 * Helper to ensure target repository is configured and valid before Git actions.
 */
async function getValidatedRepoPath() {
  const settings = repositoryService.getSettings();
  const repoPath = settings.repositoryPath ? settings.repositoryPath.trim() : '';
  if (!repoPath) {
    throw new Error('No target repository path is configured. Please select a repository in Settings.');
  }

  const validation = await repositoryService.validatePath(repoPath);
  if (!validation.isValid) {
    throw new Error(validation.message || 'Target path is not a valid Git repository.');
  }

  return { repoPath, settings };
}

// ==========================================
// 1. REPOSITORY & GIT CLI ENDPOINTS
// ==========================================

app.get('/api/git/check', async (req, res) => {
  try {
    const result = await gitReader.checkGitInstalled();
    res.json(result);
  } catch (err) {
    res.status(500).json({ installed: false, error: err.message });
  }
});

app.get('/api/repository/settings', (req, res) => {
  try {
    const settings = repositoryService.getSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/repository/settings', async (req, res) => {
  try {
    const { repositoryPath, defaultCommitMessage, defaultBranch, remoteName, authorName, authorEmail } = req.body;

    const updated = repositoryService.updateSettings({
      ...(repositoryPath !== undefined && { repositoryPath: repositoryPath.trim() }),
      ...(defaultCommitMessage !== undefined && { defaultCommitMessage: defaultCommitMessage.trim() }),
      ...(defaultBranch !== undefined && { defaultBranch: defaultBranch.trim() }),
      ...(remoteName !== undefined && { remoteName: remoteName.trim() }),
      ...(authorName !== undefined && { authorName: authorName.trim() }),
      ...(authorEmail !== undefined && { authorEmail: authorEmail.trim() })
    });

    const status = await repositoryService.getFullRepositoryStatus();
    res.json({ success: true, settings: updated, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/repository/validate', async (req, res) => {
  try {
    const { path: candidatePath } = req.body;
    if (!candidatePath) {
      return res.status(400).json({ isValid: false, message: 'Path parameter is required.' });
    }
    const validation = await repositoryService.validatePath(candidatePath);
    res.json(validation);
  } catch (err) {
    res.status(500).json({ isValid: false, message: err.message });
  }
});

app.get('/api/repository/status', async (req, res) => {
  try {
    const status = await repositoryService.getFullRepositoryStatus();
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/repository/branches', async (req, res) => {
  try {
    const { repoPath } = await getValidatedRepoPath();
    const branches = await repositoryService.getBranches(repoPath);
    res.json({ success: true, branches });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/repository/remotes', async (req, res) => {
  try {
    const { repoPath } = await getValidatedRepoPath();
    const remotes = await gitReader.getRemotes(repoPath);
    res.json({ success: true, remotes });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. GIT HISTORY ENDPOINTS (PHASE 2)
// ==========================================

app.get('/api/history', async (req, res) => {
  try {
    const { repoPath } = await getValidatedRepoPath();
    const { limit = 300, author = '', search = '', startDate = '', endDate = '', branch = '' } = req.query;

    const history = await gitHistory.getCommitHistory(repoPath, {
      limit: parseInt(limit, 10) || 300,
      author,
      search,
      startDate,
      endDate,
      branch
    });

    res.json({ success: true, ...history });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message, commits: [], totalCommits: 0 });
  }
});

app.get('/api/history/authors', async (req, res) => {
  try {
    const { repoPath } = await getValidatedRepoPath();
    const authors = await gitHistory.getUniqueAuthors(repoPath);
    res.json({ success: true, authors });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message, authors: [] });
  }
});

// ==========================================
// 3. CONTRIBUTION CALENDAR (PHASE 3)
// ==========================================

app.get('/api/contributions', async (req, res) => {
  try {
    const { repoPath } = await getValidatedRepoPath();
    const { year } = req.query;

    const calendar = await contributionService.getContributionCalendar(repoPath, year ? parseInt(year, 10) : null);
    res.json({ success: true, calendar });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/contributions/random
 * Creates random real Git commits across a date range.
 * Body: { startDate, endDate, minCommits, maxCommits, message }
 */
app.post('/api/contributions/random', async (req, res) => {
  try {
    const { repoPath, settings } = await getValidatedRepoPath();
    const {
      startDate,
      endDate,
      minCommits = 1,
      maxCommits = 5,
      message
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required.' });
    }

    const start = new Date(startDate + 'T00:00:00');
    const end   = new Date(endDate   + 'T00:00:00');

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    if (start > end) {
      return res.status(400).json({ success: false, error: 'startDate must be before or equal to endDate.' });
    }

    const min = Math.max(1, parseInt(minCommits, 10) || 1);
    const max = Math.max(min, parseInt(maxCommits, 10) || 5);

    if (max > 20) {
      return res.status(400).json({ success: false, error: 'maxCommits cannot exceed 20 per day for safety.' });
    }

    // Build a commit plan: for each date in range, random count
    const commitPlan = [];
    let cursor = new Date(start);
    let totalEstimate = 0;

    while (cursor <= end) {
      const count = Math.floor(Math.random() * (max - min + 1)) + min;
      totalEstimate += count;

      if (totalEstimate > 500) {
        return res.status(400).json({ success: false, error: 'Safety limit: total estimated commits > 500. Reduce date range or max commits.' });
      }

      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');

      commitPlan.push({
        date: `${y}-${m}-${d}`,
        time: '12:00:00',
        count,
        message: (message || settings.defaultCommitMessage || 'Git learning commit').trim(),
        authorName: settings.authorName || 'Git Learner',
        authorEmail: settings.authorEmail || 'learner@example.com'
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    const result = await gitWriter.createBatchCommits(repoPath, commitPlan);
    const status = await repositoryService.getFullRepositoryStatus();

    res.json({
      success: true,
      message: `Created ${result.createdCount} real Git commits across ${commitPlan.length} day(s).`,
      createdCount: result.createdCount,
      dayCount: commitPlan.length,
      commits: result.commits,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/contributions/remove
 * Removes real Git commits within a date range by rewriting history.
 * Requires confirmed: true in body as explicit confirmation gate.
 * Body: { startDate, endDate, confirmed }
 */
app.post('/api/contributions/remove', async (req, res) => {
  try {
    const { repoPath } = await getValidatedRepoPath();
    const { startDate, endDate, confirmed } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required.' });
    }

    const start = new Date(startDate + 'T00:00:00');
    const end   = new Date(endDate   + 'T23:59:59');

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    if (start > end) {
      return res.status(400).json({ success: false, error: 'startDate must be before or equal to endDate.' });
    }

    // Preview mode: return affected commit count without modifying anything
    if (!confirmed) {
      const history = await gitHistory.getCommitHistory(repoPath, {
        startDate,
        endDate,
        limit: 2000
      });
      const remotes = await gitReader.getRemotes(repoPath);
      return res.json({
        success: true,
        preview: true,
        affectedCount: history.totalCommits,
        hasRemote: remotes.length > 0,
        remotes
      });
    }

    // Confirmed: rewrite history
    const result = await gitWriter.removeCommitsByDateRange(repoPath, startDate, endDate);
    const status = await repositoryService.getFullRepositoryStatus();

    res.json({
      success: true,
      message: `Removed ${result.removedCount} commit(s) from ${startDate} to ${endDate}. History rewritten.`,
      removedCount: result.removedCount,
      keptCount: result.keptCount,
      originalHead: result.originalHead,
      newHead: result.newHead,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ==========================================
// 4. COMMIT LAB (PHASE 4)
// ==========================================

app.post('/api/commits/preview', async (req, res) => {
  try {
    const { repoPath, settings } = await getValidatedRepoPath();
    const { date, time = '12:00', count = 1, message, authorName, authorEmail } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, error: 'Date is required.' });
    }

    const commitCount = Math.max(1, parseInt(count, 10) || 1);
    if (commitCount > 100) {
      return res.status(400).json({ success: false, error: 'Single batch limit is 100 commits in Commit Lab.' });
    }

    const finalAuthorName = (authorName || settings.authorName || 'Git Learner').trim();
    const finalAuthorEmail = (authorEmail || settings.authorEmail || 'learner@example.com').trim();
    const finalMessage = (message || settings.defaultCommitMessage || 'Git learning commit').trim();

    const sampleDate = `${date}T${time}:00`;

    res.json({
      success: true,
      preview: {
        targetRepository: repoPath,
        date,
        time,
        sampleDate,
        commitCount,
        message: finalMessage,
        author: `${finalAuthorName} <${finalAuthorEmail}>`,
        totalCommitsToCreate: commitCount
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/commits/create', async (req, res) => {
  try {
    const { repoPath, settings } = await getValidatedRepoPath();
    const { date, time = '12:00', count = 1, message, authorName, authorEmail } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, error: 'Date is required.' });
    }

    const commitCount = Math.max(1, parseInt(count, 10) || 1);
    const finalAuthorName = (authorName || settings.authorName || 'Git Learner').trim();
    const finalAuthorEmail = (authorEmail || settings.authorEmail || 'learner@example.com').trim();
    const finalMessage = (message || settings.defaultCommitMessage || 'Git learning commit').trim();

    const plan = [{
      date,
      time: `${time}:00`,
      count: commitCount,
      message: finalMessage,
      authorName: finalAuthorName,
      authorEmail: finalAuthorEmail
    }];

    const result = await gitWriter.createBatchCommits(repoPath, plan);
    const status = await repositoryService.getFullRepositoryStatus();

    res.json({
      success: true,
      message: `Created ${result.createdCount} real Git commit(s) on ${date}.`,
      createdCount: result.createdCount,
      commits: result.commits,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. COMMIT PLANS (PHASE 5)
// ==========================================

app.get('/api/plans', (req, res) => {
  try {
    const plans = planService.getAllPlans();
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/plans', (req, res) => {
  try {
    const plan = planService.createPlan(req.body);
    res.json({ success: true, plan });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/plans/:id', (req, res) => {
  try {
    const plan = planService.getPlanById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found.' });
    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/plans/:id', (req, res) => {
  try {
    const updated = planService.updatePlan(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Plan not found.' });
    res.json({ success: true, plan: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/plans/:id', (req, res) => {
  try {
    const deleted = planService.deletePlan(req.params.id);
    res.json({ success: deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/plans/:id/apply', async (req, res) => {
  try {
    const { repoPath } = await getValidatedRepoPath();
    const result = await planService.applyPlanToGit(req.params.id, repoPath);
    const status = await repositoryService.getFullRepositoryStatus();

    res.json({
      success: true,
      message: `Plan applied! Created ${result.createdCount} real Git commits.`,
      result,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. CONTRIBUTION DESIGNER (PHASE 6 & 7)
// ==========================================

app.get('/api/designs', (req, res) => {
  try {
    const designs = designService.getAllDesigns();
    res.json({ success: true, designs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/designs', (req, res) => {
  try {
    const { name, grid, width, height } = req.body;
    if (!grid) {
      return res.status(400).json({ success: false, error: 'Design grid is required.' });
    }
    const design = designService.saveDesign({ name, grid, width, height });
    res.json({ success: true, design });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/designs/:id', (req, res) => {
  try {
    const design = designService.getDesignById(req.params.id);
    if (!design) return res.status(404).json({ success: false, error: 'Design not found.' });
    res.json({ success: true, design });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/designs/:id', (req, res) => {
  try {
    const updated = designService.updateDesign(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Design not found.' });
    res.json({ success: true, design: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/designs/:id/duplicate', (req, res) => {
  try {
    const copy = designService.duplicateDesign(req.params.id);
    if (!copy) return res.status(404).json({ success: false, error: 'Design not found.' });
    res.json({ success: true, design: copy });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/designs/:id', (req, res) => {
  try {
    const deleted = designService.deleteDesign(req.params.id);
    res.json({ success: deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/designs/generate-schedule', (req, res) => {
  try {
    const { grid, startDate } = req.body;
    if (!grid || !startDate) {
      return res.status(400).json({ success: false, error: 'Both grid and startDate are required.' });
    }
    const schedule = designService.convertGridToSchedule(grid, startDate);
    res.json({ success: true, schedule });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/designs/apply-locally', async (req, res) => {
  try {
    const { repoPath, settings } = await getValidatedRepoPath();
    const { grid, startDate, name = 'Designed Pattern', message, authorName, authorEmail } = req.body;

    if (!grid || !startDate) {
      return res.status(400).json({ success: false, error: 'Both grid and startDate are required.' });
    }

    // Convert grid to schedule
    const scheduleResult = designService.convertGridToSchedule(grid, startDate);
    if (scheduleResult.totalCommits === 0) {
      return res.status(400).json({ success: false, error: 'Grid has 0 commits to create.' });
    }

    const finalAuthorName = (authorName || settings.authorName || 'Git Learner').trim();
    const finalAuthorEmail = (authorEmail || settings.authorEmail || 'learner@example.com').trim();
    const finalMessage = (message || settings.defaultCommitMessage || 'Git pattern commit').trim();

    // Map schedule into commitPlan items
    const commitPlan = scheduleResult.schedule
      .filter(item => item.count > 0)
      .map(item => ({
        date: item.date,
        time: '12:00:00',
        count: item.count,
        message: finalMessage,
        authorName: finalAuthorName,
        authorEmail: finalAuthorEmail
      }));

    // Create real commits in Git repository
    const result = await gitWriter.createBatchCommits(repoPath, commitPlan);
    const status = await repositoryService.getFullRepositoryStatus();

    // Also auto-record a completed plan for tracking
    planService.createPlan({
      name,
      source: 'designer',
      message: finalMessage,
      authorName: finalAuthorName,
      authorEmail: finalAuthorEmail,
      schedule: scheduleResult.schedule.filter(s => s.count > 0)
    });

    res.json({
      success: true,
      message: `Created ${result.createdCount} real Git commits across ${scheduleResult.activeDays} active days.`,
      createdCount: result.createdCount,
      commits: result.commits,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 7. REMOTE SYNC: PULL & PUSH (PHASE 8)
// ==========================================

app.post('/api/git/pull', async (req, res) => {
  try {
    const { repoPath, settings } = await getValidatedRepoPath();
    const { remoteName = settings.remoteName, branchName = settings.defaultBranch } = req.body;

    const result = await gitWriter.pullFromRemote(repoPath, remoteName, branchName);
    const status = await repositoryService.getFullRepositoryStatus();

    res.json({
      success: true,
      output: result.output,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/git/push', async (req, res) => {
  try {
    const { repoPath, settings } = await getValidatedRepoPath();
    const { remoteName = settings.remoteName, branchName = settings.defaultBranch, force = false } = req.body;

    const result = await gitWriter.pushToRemote(repoPath, remoteName, branchName, force);
    const status = await repositoryService.getFullRepositoryStatus();

    res.json({
      success: true,
      output: result.output,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 8. CONTROLLED HISTORY MANAGEMENT (PHASE 9)
// ==========================================

app.post('/api/git/reset-commits', async (req, res) => {
  try {
    const { repoPath } = await getValidatedRepoPath();
    const { count = 1, hard = true } = req.body;

    const result = await gitWriter.resetLastCommits(repoPath, count, hard);
    const status = await repositoryService.getFullRepositoryStatus();

    res.json({
      success: true,
      message: result.message,
      currentHead: result.currentHead,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/git/reset-branch', async (req, res) => {
  try {
    const { repoPath, settings } = await getValidatedRepoPath();
    const { branchName = settings.defaultBranch } = req.body;

    const result = await gitWriter.resetTestBranch(repoPath, branchName);
    const status = await repositoryService.getFullRepositoryStatus();

    res.json({
      success: true,
      message: result.message,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log('====================================================');
  console.log(` Git Contribution Designer & Git History Lab`);
  console.log(` Server running locally at: http://localhost:${PORT}`);
  console.log('====================================================');
});
