/**
 * planService.js
 * 
 * Manages commit plans in data/plans.json.
 * A plan is an INTENTION to create commits.
 * Applying a plan converts it into REAL Git commits in the target repository.
 */

const path = require('path');
const { readJsonFile, writeJsonFile } = require('../utils/fileStore');
const gitWriter = require('../git/gitWriter');

const PLANS_PATH = path.join(__dirname, '../../data/plans.json');

/**
 * Returns all saved plans.
 * 
 * @returns {Array} List of plans
 */
function getAllPlans() {
  return readJsonFile(PLANS_PATH, []);
}

/**
 * Finds a plan by ID.
 * 
 * @param {string} id 
 * @returns {object|null}
 */
function getPlanById(id) {
  const plans = getAllPlans();
  return plans.find(p => p.id === id) || null;
}

/**
 * Creates and saves a new plan.
 * 
 * @param {object} planData - { name, schedule: Array<{ date, count }>, message, source }
 * @returns {object} Created plan object
 */
function createPlan(planData) {
  const plans = getAllPlans();
  const id = `plan-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  // Calculate total commits in schedule
  const schedule = Array.isArray(planData.schedule) ? planData.schedule : [];
  let totalCommits = 0;
  schedule.forEach(s => {
    totalCommits += Math.max(0, parseInt(s.count, 10) || 0);
  });

  const newPlan = {
    id,
    name: planData.name || `Plan ${new Date().toLocaleDateString()}`,
    source: planData.source || 'designer',
    message: planData.message || 'Git learning commit',
    authorName: planData.authorName || 'Git Learner',
    authorEmail: planData.authorEmail || 'learner@example.com',
    schedule,
    totalDays: schedule.length,
    totalCommits,
    status: 'planned', // 'planned' | 'completed' | 'cancelled'
    createdAt: new Date().toISOString(),
    completedAt: null
  };

  plans.unshift(newPlan);
  writeJsonFile(PLANS_PATH, plans);
  return newPlan;
}

/**
 * Updates an existing plan.
 * 
 * @param {string} id 
 * @param {object} updates 
 * @returns {object|null}
 */
function updatePlan(id, updates) {
  const plans = getAllPlans();
  const index = plans.findIndex(p => p.id === id);
  if (index === -1) return null;

  plans[index] = {
    ...plans[index],
    ...updates
  };

  writeJsonFile(PLANS_PATH, plans);
  return plans[index];
}

/**
 * Deletes a plan by ID.
 * 
 * @param {string} id 
 * @returns {boolean}
 */
function deletePlan(id) {
  const plans = getAllPlans();
  const filtered = plans.filter(p => p.id !== id);
  if (filtered.length === plans.length) return false;
  writeJsonFile(PLANS_PATH, filtered);
  return true;
}

/**
 * Applies a plan to the target Git repository, creating the real Git commits.
 * 
 * @param {string} id - Plan ID
 * @param {string} repoPath - Target Git repository path
 * @returns {Promise<{ success: boolean, createdCommits: Array, plan: object }>}
 */
async function applyPlanToGit(id, repoPath) {
  const plan = getPlanById(id);
  if (!plan) {
    throw new Error(`Plan "${id}" not found.`);
  }

  if (plan.schedule.length === 0 || plan.totalCommits === 0) {
    throw new Error('This plan has no commits scheduled.');
  }

  // Format schedule items for gitWriter
  const commitPlan = plan.schedule.map(item => ({
    date: item.date,
    time: item.time || '14:00:00',
    count: item.count,
    message: plan.message,
    authorName: plan.authorName,
    authorEmail: plan.authorEmail
  }));

  // Create real commits in Git
  const result = await gitWriter.createBatchCommits(repoPath, commitPlan);

  // Update plan status to completed
  const updatedPlan = updatePlan(id, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    createdCommitsCount: result.createdCount
  });

  return {
    success: true,
    createdCount: result.createdCount,
    commits: result.commits,
    plan: updatedPlan
  };
}

module.exports = {
  getAllPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  applyPlanToGit
};
