import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireOrgRole } from "./lib/auth";
import { computeImpact, type AssetNode, type AssetEdge, type ImpactSignal, type ImpactRow } from "./lib/impact";
import type { Severity } from "./lib/alert-match";

export interface ReportEvent {
  title: string;
  severity: Severity;
  source: string | null;
  matched: string[];
  createdAt: number;
}
export interface ReportData {
  orgName: string;
  periodStart: number;
  periodEnd: number;
  events: ReportEvent[];
  impactRows: ImpactRow[];
  totalRevenueAtRisk: number;
  watchlistCount: number;
  alertCount: number;
}

/** Assert the caller can access this org (auth propagates from the action). */
export const assertMember = internalQuery({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args): Promise<{ userId: Id<"users">; orgName: string }> => {
    const { user } = await requireOrgRole(ctx, args.orgId, "viewer");
    const org = await ctx.db.get(args.orgId);
    return { userId: user._id, orgName: org?.name ?? "Organization" };
  },
});

/** Orgs eligible for scheduled reports (have any asset or alert configured). */
export const activeOrgIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"organizations">[]> => {
    const ids = new Set<Id<"organizations">>();
    for (const a of await ctx.db.query("alerts").collect()) if (!a.deletedAt) ids.add(a.orgId);
    for (const a of await ctx.db.query("assets").collect()) if (!a.deletedAt) ids.add(a.orgId);
    return [...ids];
  },
});

/** Assemble report inputs. Internal (no auth) — callers gate access first. */
export const gatherReportData = internalQuery({
  args: { orgId: v.id("organizations"), sinceMs: v.number() },
  handler: async (ctx, args): Promise<ReportData> => {
    const org = await ctx.db.get(args.orgId);
    const periodEnd = Date.now();
    const periodStart = periodEnd - args.sinceMs;

    const allEvents = await ctx.db
      .query("alertEvents")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .order("desc")
      .take(80);
    const windowEvents = allEvents.filter((e) => e.createdAt >= periodStart);
    const events: ReportEvent[] = windowEvents.map((e) => ({
      title: e.title,
      severity: e.severity as Severity,
      source: e.source ?? null,
      matched: e.matched,
      createdAt: e.createdAt,
    }));

    const assetDocs = (
      await ctx.db.query("assets").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect()
    ).filter((a) => !a.deletedAt);
    const linkDocs = (
      await ctx.db.query("assetLinks").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect()
    ).filter((l) => !l.deletedAt);
    const nodes: AssetNode[] = assetDocs.map((a) => ({
      id: a._id, name: a.name, type: a.type, criticality: a.criticality,
      revenueAtRisk: a.revenueAtRisk, entities: a.entities,
    }));
    const edges: AssetEdge[] = linkDocs.map((l) => ({ fromAssetId: l.fromAssetId, toAssetId: l.toAssetId, weight: l.weight }));
    const signals: ImpactSignal[] = windowEvents.map((e) => ({ severity: e.severity as Severity, title: e.title, topics: e.matched }));
    const impact = computeImpact(nodes, edges, signals);

    const watchlists = (
      await ctx.db.query("watchlists").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect()
    ).filter((w) => !w.deletedAt);
    const alerts = (
      await ctx.db.query("alerts").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect()
    ).filter((a) => !a.deletedAt);

    return {
      orgName: org?.name ?? "Organization",
      periodStart,
      periodEnd,
      events,
      impactRows: impact.rows.slice(0, 8),
      totalRevenueAtRisk: impact.totalRevenueAtRisk,
      watchlistCount: watchlists.length,
      alertCount: alerts.length,
    };
  },
});

export const saveReport = internalMutation({
  args: {
    orgId: v.id("organizations"),
    generatedByUserId: v.optional(v.id("users")),
    title: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
    summary: v.string(),
    keyJudgements: v.array(v.string()),
    recommendations: v.array(v.string()),
    totalRevenueAtRisk: v.number(),
    eventCount: v.number(),
    html: v.string(),
    source: v.union(v.literal("manual"), v.literal("scheduled")),
  },
  handler: async (ctx, args): Promise<Id<"reports">> => {
    return await ctx.db.insert("reports", { ...args, createdAt: Date.now() });
  },
});

/** List an org's reports (metadata only). */
export const list = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const rows = await ctx.db
      .query("reports")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .order("desc")
      .take(50);
    return rows.map((r) => ({
      id: r._id,
      title: r.title,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      totalRevenueAtRisk: r.totalRevenueAtRisk,
      eventCount: r.eventCount,
      source: r.source,
      createdAt: r.createdAt,
    }));
  },
});

/** Fetch a single report including its rendered HTML. */
export const get = query({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.reportId);
    if (!r) return null;
    await requireOrgRole(ctx, r.orgId, "viewer");
    return {
      id: r._id,
      title: r.title,
      summary: r.summary,
      keyJudgements: r.keyJudgements,
      recommendations: r.recommendations,
      html: r.html,
    };
  },
});
