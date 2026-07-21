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

// Weekly executive brief for every active org (Mondays 08:00 UTC).
crons.weekly(
  "sentineliq weekly executive brief",
  { dayOfWeek: "monday", hourUTC: 8, minuteUTC: 0 },
  internal.reportsNode.scheduledReports,
  {},
);

export default crons;
