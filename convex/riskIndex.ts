import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgRole } from "./lib/auth";
import {
  computeRiskIndex,
  classifyEvent,
  RISK_FACTORS,
  type RiskFactor,
  type RiskEvent,
} from "./lib/risk-index";
import type { Severity } from "./lib/alert-match";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface Driver {
  title: string;
  severity: Severity;
  source: string | null;
  url: string | null;
}

/**
 * Per-org multi-factor risk index with confidence and per-factor source
 * references (the events driving each factor).
 */
export const orgRiskIndex = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const now = Date.now();

    const rows = await ctx.db
      .query("alertEvents")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .order("desc")
      .take(120);
    const events: RiskEvent[] = rows.map((e) => ({
      severity: e.severity as Severity,
      createdAt: e.createdAt,
      title: e.title,
      matched: e.matched,
    }));

    const index = computeRiskIndex(events, now, WINDOW_MS);

    const drivers = {} as Record<RiskFactor, Driver[]>;
    for (const f of RISK_FACTORS) drivers[f] = [];
    const sevRank: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    for (const e of rows) {
      if (now - e.createdAt > WINDOW_MS) continue;
      for (const f of classifyEvent(e.title, e.matched)) {
        if (drivers[f].length < 3) {
          drivers[f].push({ title: e.title, severity: e.severity as Severity, source: e.source ?? null, url: e.url ?? null });
        }
      }
    }
    // Sort each factor's drivers by severity.
    for (const f of RISK_FACTORS) drivers[f].sort((a, b) => sevRank[b.severity] - sevRank[a.severity]);

    return { ...index, drivers };
  },
});
