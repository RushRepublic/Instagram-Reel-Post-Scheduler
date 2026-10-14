// Replacement for Celery's ETA scheduling: due rows are found in MySQL, so a
// schedule survives restarts and does not depend on any long-lived worker.
const env = require("../config/env");
const { query } = require("../config/db");
const { nowDb } = require("../lib/dates");
const { publishScheduledContent } = require("../services/publisher");

/** Rows stuck in PROCESSING (process killed mid-publish) -> FAILED so the user can inspect/retry. */
async function failStuckProcessing() {
  const r = await query(
    `UPDATE scheduler_scheduledcontent
        SET status='FAILED', failed_at=?, updated_at=?,
            failure_reason='Publishing was interrupted (the worker stopped mid-publish). Check Instagram before retrying.'
      WHERE status='PROCESSING' AND updated_at < (UTC_TIMESTAMP(6) - INTERVAL ? MINUTE)`,
    [nowDb(), nowDb(), env.scheduler.stuckMinutes]
  );
  return r.affectedRows;
}

/**
 * Publishes every SCHEDULED row whose scheduled_at has passed. Safe to run
 * concurrently from several processes: each row is claimed atomically.
 * Resolves when all claimed publishes have finished.
 */
async function runDueJobs(limit = 20) {
  const stuck = await failStuckProcessing();
  if (stuck) console.warn(`Marked ${stuck} stuck PROCESSING item(s) as FAILED.`);

  const due = await query(
    `SELECT id FROM scheduler_scheduledcontent
      WHERE status='SCHEDULED' AND scheduled_at <= UTC_TIMESTAMP(6)
      ORDER BY scheduled_at ASC LIMIT ?`,
    [limit]
  );
  const results = await Promise.allSettled(due.map((r) => publishScheduledContent(r.id)));
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`content_id=${due[i].id} job crashed:`, r.reason);
  });
  return due.length;
}

function startInProcessScheduler() {
  const timer = setInterval(() => {
    runDueJobs().catch((err) => console.error("Scheduler tick failed:", err.message));
  }, env.scheduler.pollSeconds * 1000);
  timer.unref();
  return timer;
}

module.exports = { runDueJobs, startInProcessScheduler, failStuckProcessing };
