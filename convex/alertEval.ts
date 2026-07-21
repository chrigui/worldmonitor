import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { Signal, Severity } from "./lib/alert-match";

/** Distinct orgs that have at least one enabled alert. */
export const orgIdsWithEnabledAlerts = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"organizations">[]> => {
    const alerts = await ctx.db.query("alerts").collect();
    const ids = new Set<Id<"organizations">>();
    for (const a of alerts) if (!a.deletedAt && a.enabled) ids.add(a.orgId);
    return [...ids];
  },
});

function coerceSeverity(x: unknown): Severity {
  if (typeof x === "string") {
    const s = x.toLowerCase();
    if (s === "low" || s === "medium" || s === "high" || s === "critical") return s;
  }
  if (typeof x === "number") {
    if (x >= 0.85 || x >= 85) return "critical";
    if (x >= 0.6 || x >= 60) return "high";
    if (x >= 0.3 || x >= 30) return "medium";
    return "low";
  }
  return "medium";
}

function toArr(x: unknown): string[] {
  if (Array.isArray(x)) return x.map((v) => String(v)).filter(Boolean);
  if (typeof x === "string" && x.trim()) return [x.trim()];
  return [];
}

function mapItem(it: Record<string, unknown>): Signal | null {
  const title = it.title ?? it.headline ?? it.summary;
  if (!title) return null;
  return {
    severity: coerceSeverity(it.severity ?? it.risk ?? it.riskLevel ?? it.score),
    title: String(title),
    url: (it.url ?? it.link) ? String(it.url ?? it.link) : undefined,
    source: (it.source ?? it.provider) ? String(it.source ?? it.provider) : undefined,
    countries: toArr(it.countries ?? it.country ?? it.countryCodes),
    companies: toArr(it.companies ?? it.tickers ?? it.entities),
    topics: toArr(it.topics ?? it.tags ?? it.categories),
  };
}

/**
 * Pull candidate signals from the live intelligence API and map them to the
 * engine's Signal shape. The endpoint and field mapping are best-effort and
 * tunable via SENTINELIQ_SIGNALS_URL; failures return [] rather than throwing.
 */
async function fetchSignals(): Promise<Signal[]> {
  const url =
    process.env.SENTINELIQ_SIGNALS_URL ??
    "https://api.worldmonitor.app/api/intelligence/summary";
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const items: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { results?: unknown[] })?.results)
          ? (data as { results: unknown[] }).results
          : [];
    return items
      .map((it) => mapItem(it as Record<string, unknown>))
      .filter((s): s is Signal => s !== null);
  } catch (err) {
    console.error("[alertEval] fetchSignals failed:", err);
    return [];
  }
}

/**
 * Scheduled evaluation: fetch live signals once, then run the engine for every
 * org with enabled alerts. Invoked by the cron in convex/crons.ts.
 */
export const scheduledEvaluate = internalAction({
  args: {},
  handler: async (ctx) => {
    const signals = await fetchSignals();
    if (signals.length === 0) return { orgs: 0, signals: 0, events: 0 };
    const orgIds = await ctx.runQuery(internal.alertEval.orgIdsWithEnabledAlerts, {});
    let events = 0;
    for (const orgId of orgIds) {
      const r = await ctx.runMutation(internal.alerts.internalEvaluate, { orgId, signals });
      events += r.eventsCreated;
    }
    return { orgs: orgIds.length, signals: signals.length, events };
  },
});
