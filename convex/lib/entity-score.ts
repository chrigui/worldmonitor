// Pure entity risk scoring: turn a set of dated alert events into a 0..100 risk
// score and a recent-vs-prior trend. No Convex imports so it stays testable.

import type { Severity } from "./alert-match";

const WEIGHT: Record<Severity, number> = { low: 1, medium: 2, high: 4, critical: 7 };

export type Trend = "up" | "down" | "flat";

export interface ScoredEntity {
  score: number; // 0..100
  trend: Trend;
  recentCount: number;
  priorCount: number;
}

/**
 * Score an entity from its matching events. Events within `windowMs` of `now`
 * form the recent window; the preceding equal window is the prior baseline.
 * Score scales the recent severity-weighted sum; trend compares the two windows.
 */
export function scoreEntity(
  events: { severity: Severity; createdAt: number }[],
  now: number,
  windowMs: number,
): ScoredEntity {
  let recent = 0;
  let prior = 0;
  let recentCount = 0;
  let priorCount = 0;
  for (const e of events) {
    const age = now - e.createdAt;
    if (age <= windowMs) {
      recent += WEIGHT[e.severity];
      recentCount++;
    } else if (age <= 2 * windowMs) {
      prior += WEIGHT[e.severity];
      priorCount++;
    }
  }
  const score = Math.min(100, Math.round(recent * 12));
  let trend: Trend;
  if (recent > prior * 1.15 && recent > 0) trend = "up";
  else if (recent < prior * 0.85) trend = "down";
  else trend = "flat";
  return { score, trend, recentCount, priorCount };
}
