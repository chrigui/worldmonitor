import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { requireOrgRole } from "./lib/auth";
import { writeAudit } from "./lib/audit";
import { signalFiresAlert, type Signal, type WatchlistItem } from "./lib/alert-match";

const severityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

const channelValidator = v.union(
  v.literal("email"),
  v.literal("slack"),
  v.literal("webhook"),
  v.literal("in_app"),
);

const signalValidator = v.object({
  severity: severityValidator,
  title: v.string(),
  url: v.optional(v.string()),
  source: v.optional(v.string()),
  countries: v.optional(v.array(v.string())),
  companies: v.optional(v.array(v.string())),
  topics: v.optional(v.array(v.string())),
});

function serialize(a: Doc<"alerts">) {
  return {
    id: a._id,
    name: a.name,
    minSeverity: a.minSeverity,
    channels: a.channels,
    watchlistId: a.watchlistId ?? null,
    enabled: a.enabled,
    updatedAt: a.updatedAt,
  };
}

/** Resolve an alert's scope items from its linked watchlist (empty if none). */
async function scopeItems(
  ctx: QueryCtx | MutationCtx,
  watchlistId: Id<"watchlists"> | undefined,
): Promise<WatchlistItem[]> {
  if (!watchlistId) return [];
  const wl = await ctx.db.get(watchlistId);
  if (!wl || wl.deletedAt) return [];
  return wl.items.map((it) => ({ type: it.type, value: it.value }));
}

export const list = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const rows = await ctx.db
      .query("alerts")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return rows.filter((a) => !a.deletedAt).map(serialize);
  },
});

export const create = mutation({
  args: {
    orgId: v.id("organizations"),
    name: v.string(),
    minSeverity: severityValidator,
    channels: v.array(channelValidator),
    watchlistId: v.optional(v.id("watchlists")),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgRole(ctx, args.orgId, "analyst");
    const name = args.name.trim();
    if (!name) throw new Error("Alert name is required");

    if (args.watchlistId) {
      const wl = await ctx.db.get(args.watchlistId);
      if (!wl || wl.deletedAt || wl.orgId !== args.orgId) {
        throw new Error("Watchlist not found in this organization");
      }
    }

    const now = Date.now();
    const alertId = await ctx.db.insert("alerts", {
      orgId: args.orgId,
      createdByUserId: user._id,
      name,
      minSeverity: args.minSeverity,
      channels: args.channels,
      watchlistId: args.watchlistId,
      enabled: args.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      orgId: args.orgId,
      actorUserId: user._id,
      action: "alert.create",
      targetType: "alert",
      targetId: alertId,
      metadata: { name, minSeverity: args.minSeverity },
    });
    return { alertId };
  },
});

export const update = mutation({
  args: {
    alertId: v.id("alerts"),
    name: v.optional(v.string()),
    minSeverity: v.optional(severityValidator),
    channels: v.optional(v.array(channelValidator)),
    watchlistId: v.optional(v.id("watchlists")),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.alertId);
    if (!existing || existing.deletedAt) throw new Error("Alert not found");
    const { user } = await requireOrgRole(ctx, existing.orgId, "analyst");

    const patch: {
      updatedAt: number;
      name?: string;
      minSeverity?: Doc<"alerts">["minSeverity"];
      channels?: Doc<"alerts">["channels"];
      watchlistId?: Id<"watchlists">;
      enabled?: boolean;
    } = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Alert name cannot be empty");
      patch.name = name;
    }
    if (args.minSeverity !== undefined) patch.minSeverity = args.minSeverity;
    if (args.channels !== undefined) patch.channels = args.channels;
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    if (args.watchlistId !== undefined) {
      const wl = await ctx.db.get(args.watchlistId);
      if (!wl || wl.deletedAt || wl.orgId !== existing.orgId) {
        throw new Error("Watchlist not found in this organization");
      }
      patch.watchlistId = args.watchlistId;
    }

    await ctx.db.patch(args.alertId, patch);
    await writeAudit(ctx, {
      orgId: existing.orgId,
      actorUserId: user._id,
      action: "alert.update",
      targetType: "alert",
      targetId: args.alertId,
      metadata: { fields: Object.keys(patch).filter((k) => k !== "updatedAt") },
    });
    return { ok: true as const };
  },
});

export const remove = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.alertId);
    if (!existing || existing.deletedAt) throw new Error("Alert not found");
    const { user } = await requireOrgRole(ctx, existing.orgId, "analyst");
    await ctx.db.patch(args.alertId, { deletedAt: Date.now() });
    await writeAudit(ctx, {
      orgId: existing.orgId,
      actorUserId: user._id,
      action: "alert.delete",
      targetType: "alert",
      targetId: args.alertId,
      metadata: { name: existing.name },
    });
    return { ok: true as const };
  },
});

/**
 * Evaluation engine. Runs a batch of candidate signals against every enabled
 * alert in the org and records an `alertEvents` row for each hit. In production
 * a scheduled action pulls signals from the news/intelligence API and calls
 * this; here it accepts signals directly so it is drivable and testable.
 */
export const evaluate = mutation({
  args: { orgId: v.id("organizations"), signals: v.array(signalValidator) },
  handler: async (ctx, args) => {
    const { user } = await requireOrgRole(ctx, args.orgId, "analyst");

    const alerts = (
      await ctx.db
        .query("alerts")
        .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
        .collect()
    ).filter((a) => !a.deletedAt && a.enabled);

    // Cache watchlist scope per alert to avoid repeated reads.
    const scopeCache = new Map<string, WatchlistItem[]>();
    let eventsCreated = 0;
    const now = Date.now();

    for (const alert of alerts) {
      const key = alert.watchlistId ?? "none";
      let items = scopeCache.get(key);
      if (!items) {
        items = await scopeItems(ctx, alert.watchlistId);
        scopeCache.set(key, items);
      }
      for (const signal of args.signals as Signal[]) {
        const { fires, matched } = signalFiresAlert(signal, alert.minSeverity, items);
        if (!fires) continue;
        await ctx.db.insert("alertEvents", {
          orgId: args.orgId,
          alertId: alert._id,
          severity: signal.severity,
          title: signal.title,
          url: signal.url,
          source: signal.source,
          matched,
          createdAt: now,
        });
        eventsCreated++;
      }
    }

    await writeAudit(ctx, {
      orgId: args.orgId,
      actorUserId: user._id,
      action: "alert.evaluate",
      targetType: "organization",
      targetId: args.orgId,
      metadata: { signals: args.signals.length, alerts: alerts.length, eventsCreated },
    });
    return { alertsEvaluated: alerts.length, eventsCreated };
  },
});

export const listEvents = query({
  args: { orgId: v.id("organizations"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const rows = await ctx.db
      .query("alertEvents")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));
    return rows.map((e) => ({
      id: e._id,
      alertId: e.alertId,
      severity: e.severity,
      title: e.title,
      url: e.url ?? null,
      source: e.source ?? null,
      matched: e.matched,
      createdAt: e.createdAt,
      acknowledged: Boolean(e.acknowledgedAt),
    }));
  },
});

export const acknowledgeEvent = mutation({
  args: { eventId: v.id("alertEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const { user } = await requireOrgRole(ctx, event.orgId, "analyst");
    if (event.acknowledgedAt) return { ok: true as const };
    await ctx.db.patch(args.eventId, {
      acknowledgedAt: Date.now(),
      acknowledgedByUserId: user._id,
    });
    return { ok: true as const };
  },
});
