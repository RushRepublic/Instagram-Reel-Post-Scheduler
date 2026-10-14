const env = require("./config/env");
const app = require("./app");
const { startInProcessScheduler, runDueJobs } = require("./jobs/runDueJobs");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Rush Republic API listening on port ${PORT}`);
  if (env.scheduler.inProcess) {
    startInProcessScheduler();
    runDueJobs().catch((err) => console.error("Initial scheduler run failed:", err.message));
    console.log(`In-process scheduler active (every ${env.scheduler.pollSeconds}s).`);
  }
});
