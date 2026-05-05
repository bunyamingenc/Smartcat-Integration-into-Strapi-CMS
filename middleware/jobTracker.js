// jobTracker.js
// Simple file-based job state tracker
// Stores: contentId → { strapiDocumentId, smartcatDocumentIds, exportTaskIds, status }

import fs from "fs";
import path from "path";

const JOBS_FILE = path.resolve("jobs.json");

/**
 * Load all jobs from disk.
 * @returns {object} jobs map
 */
function loadJobs() {
  if (!fs.existsSync(JOBS_FILE)) return {};
  const raw = fs.readFileSync(JOBS_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("[jobTracker] jobs.json is corrupted — resetting.");
    return {};
  }
}

/**
 * Save all jobs to disk.
 * @param {object} jobs
 */
function saveJobs(jobs) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), "utf-8");
}

/**
 * Create or overwrite a job entry.
 * @param {string} contentId        - e.g. "article-804"
 * @param {string} strapiDocumentId - Strapi's internal document ID
 */
export function createJob(contentId, strapiDocumentId) {
  const jobs = loadJobs();
  jobs[contentId] = {
    contentId,
    strapiDocumentId,
    smartcatDocumentIds: {},   // { "tr": "docId_langId", "es": "docId_langId" }
    exportTaskIds: {},          // { "tr": "taskId", "es": "taskId" }
    status: "pending",          // pending → exported → translating → ready → synced
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveJobs(jobs);
  console.log(`[jobTracker] Job created for "${contentId}"`);
}

/**
 * Update specific fields of an existing job.
 * @param {string} contentId
 * @param {object} updates   - partial fields to merge in
 */
export function updateJob(contentId, updates) {
  const jobs = loadJobs();
  if (!jobs[contentId]) {
    throw new Error(`[jobTracker] No job found for contentId "${contentId}"`);
  }
  jobs[contentId] = {
    ...jobs[contentId],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveJobs(jobs);
}

/**
 * Get a single job by contentId.
 * @param {string} contentId
 * @returns {object|null}
 */
export function getJob(contentId) {
  const jobs = loadJobs();
  return jobs[contentId] ?? null;
}

/**
 * Get all jobs.
 * @returns {object[]}
 */
export function getAllJobs() {
  return Object.values(loadJobs());
}

/**
 * Print a summary of all jobs to console.
 */
export function printJobSummary() {
  const jobs = getAllJobs();
  if (jobs.length === 0) {
    console.log("[jobTracker] No jobs found.");
    return;
  }
  console.log("\n[jobTracker] Current jobs:");
  for (const job of jobs) {
    console.log(`  ${job.contentId} | status: ${job.status} | updated: ${job.updatedAt}`);
  }
  console.log("");
}
