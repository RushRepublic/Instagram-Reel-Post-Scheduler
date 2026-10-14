// Entry point for the Hostinger hPanel cron job (run every minute):
//   node /home/USER/.../backend-node/scripts/run-due-jobs.js
// Publishes everything that is due, waits for the work to finish, then exits.
const { runDueJobs } = require("../src/jobs/runDueJobs");
const { pool } = require("../src/config/db");

runDueJobs()
  .then((n) => console.log(`[${new Date().toISOString()}] run-due-jobs: processed ${n} due item(s).`))
  .catch((err) => {
    console.error("run-due-jobs failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
