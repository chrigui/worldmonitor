import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgRole } from "./lib/auth";
import { scoreEntity, type Trend } from "./lib/entity-score";
import type { Severity } from "./lib/alert-match";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface EventLite {
  severity: Severity;
  createdAt: number;
  title: string;
  source: string | null;
  url: string | null;
  matched: string[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Does an event reference this entity value (by match tag or title)? */
function eventMatches(e: EventLite, value: string): boolean {
  const v = norm(value);
  return e.matched.some((m) => norm(m) === v) || norm(e.title).includes(v);
}

async function loadEvents(ctx: any, orgId: any): Promise<EventLite[]> {
  const rows = await ctx.db
    .query("alertEvents")
    .withIndex("by_org", (q: any) => q.eq("orgId", orgId))
    .order("desc")
    .take(200);
  return rows.map((e: any) => ({
    severity: e.severity,
    createdAt: e.createdAt,
    title: e.title,
    source: e.source ?? null,
    url: e.url ?? null,
    matched: e.matched,
  }));
}

/**
 * Directory of tracked entities (drawn from watchlists + assets) with a risk
 * score and trend derived from matching alert events.
 */
export const list = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const events = await loadEvents(ctx, args.orgId);
    const now = Date.now();

    // Candidate entities: value -> {type, label}
    const candidates = new Map<string, { type: string; label: string }>();
    const watchlists = (
      await ctx.db.query("watchlists").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect()
    ).filter((w) => !w.deletedAt);
    for (const w of watchlists) {
      for (const it of w.items) {
        if (!candidates.has(norm(it.value))) candidates.set(norm(it.value), { type: it.type, label: it.label ?? it.value });
      }
    }
    const assets = (
      await ctx.db.query("assets").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect()
    ).filter((a) => !a.deletedAt);
    for (const a of assets) {
      for (const e of a.entities) {
        if (!candidates.has(norm(e.value))) candidates.set(norm(e.value), { type: e.type, label: e.value });
      }
    }

    const out = [];
    for (const [key, meta] of candidates) {
      const matching = events.filter((e) => eventMatches(e, key));
      const scored = scoreEntity(matching, now, WINDOW_MS);
      out.push({
        value: meta.label,
        type: meta.type,
        score: scored.score,
        trend: scored.trend as Trend,
        eventCount: matching.length,
      });
    }
    out.sort((a, b) => b.score - a.score || b.eventCount - a.eventCount);
    return out.slice(0, 40);
  },
});

/** Full dossier for a single entity value. */
export const dossier = query({
  args: { orgId: v.id("organizations"), value: v.string() },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const value = args.value.trim();
    const now = Date.now();
    const events = (await loadEvents(ctx, args.orgId)).filter((e) => eventMatches(e, value));
    const scored = scoreEntity(events, now, WINDOW_MS);

    const watchlists = (
      await ctx.db.query("watchlists").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect()
    ).filter((w) => !w.deletedAt && w.items.some((it) => norm(it.value) === norm(value)));

    const assets = (
      await ctx.db.query("assets").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect()
    ).filter((a) => !a.deletedAt && a.entities.some((e) => norm(e.value) === norm(value)));

    const sourceSet = new Map<string, string | null>();
    for (const e of events) if (e.source) sourceSet.set(e.source, e.url);

    return {
      value,
      score: scored.score,
      trend: scored.trend as Trend,
      recentCount: scored.recentCount,
      priorCount: scored.priorCount,
      drivers: events.slice(0, 8).map((e) => ({
        title: e.title,
        severity: e.severity,
        source: e.source,
        url: e.url,
        createdAt: e.createdAt,
      })),
      watchlists: watchlists.map((w) => w.name),
      assets: assets.map((a) => ({ name: a.name, criticality: a.criticality, revenueAtRisk: a.revenueAtRisk ?? 0 })),
      sources: [...sourceSet.entries()].map(([name, url]) => ({ name, url })),
    };
  },
});
