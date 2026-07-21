import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run the alert evaluation engine against live signals every 30 minutes.
// Adjust the interval or gate behind an env flag as volume grows.
crons.interval(
  "sentineliq scheduled alert evaluation",
  { minutes: 30 },
  internal.alertEval.scheduledEvaluate,
  {},
);

export default crons;
