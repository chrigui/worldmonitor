import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireOrgRole } from "./lib/auth";
import { writeAudit } from "./lib/audit";
import {
  computeImpact,
  type AssetNode,
  type AssetEdge,
  type ImpactSignal,
} from "./lib/impact";
import type { Severity } from "./lib/alert-match";

const typeValidator = v.union(
  v.literal("supplier"),
  v.literal("facility"),
  v.literal("route"),
  v.literal("product"),
  v.literal("market"),
  v.literal("other"),
);
const criticalityValidator = v.union(
  v.literal("tier1"),
  v.literal("tier2"),
  v.literal("tier3"),
);
const entityValidator = v.object({
  type: v.union(v.literal("company"), v.literal("country"), v.literal("topic")),
  value: v.string(),
});

function serialize(a: Doc<"assets">) {
  return {
    id: a._id,
    name: a.name,
    type: a.type,
    criticality: a.criticality,
    revenueAtRisk: a.revenueAtRisk ?? 0,
    country: a.country ?? null,
    entities: a.entities,
  };
}

export const list = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const rows = await ctx.db
      .query("assets")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return rows.filter((a) => !a.deletedAt).map(serialize);
  },
});

export const create = mutation({
  args: {
    orgId: v.id("organizations"),
    name: v.string(),
    type: typeValidator,
    criticality: criticalityValidator,
    revenueAtRisk: v.optional(v.number()),
    country: v.optional(v.string()),
    entities: v.optional(v.array(entityValidator)),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgRole(ctx, args.orgId, "analyst");
    const name = args.name.trim();
    if (!name) throw new Error("Asset name is required");
    const now = Date.now();
    const assetId = await ctx.db.insert("assets", {
      orgId: args.orgId,
      name,
      type: args.type,
      criticality: args.criticality,
      revenueAtRisk: args.revenueAtRisk,
      country: args.country,
      entities: args.entities ?? [],
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      orgId: args.orgId,
      actorUserId: user._id,
      action: "asset.create",
      targetType: "asset",
      targetId: assetId,
      metadata: { name, type: args.type, criticality: args.criticality },
    });
    return { assetId };
  },
});

export const update = mutation({
  args: {
    assetId: v.id("assets"),
    name: v.optional(v.string()),
    type: v.optional(typeValidator),
    criticality: v.optional(criticalityValidator),
    revenueAtRisk: v.optional(v.number()),
    country: v.optional(v.string()),
    entities: v.optional(v.array(entityValidator)),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.assetId);
    if (!existing || existing.deletedAt) throw new Error("Asset not found");
    const { user } = await requireOrgRole(ctx, existing.orgId, "analyst");
    const patch: {
      updatedAt: number;
      name?: string;
      type?: Doc<"assets">["type"];
      criticality?: Doc<"assets">["criticality"];
      revenueAtRisk?: number;
      country?: string;
      entities?: Doc<"assets">["entities"];
    } = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const n = args.name.trim();
      if (!n) throw new Error("Asset name cannot be empty");
      patch.name = n;
    }
    if (args.type !== undefined) patch.type = args.type;
    if (args.criticality !== undefined) patch.criticality = args.criticality;
    if (args.revenueAtRisk !== undefined) patch.revenueAtRisk = args.revenueAtRisk;
    if (args.country !== undefined) patch.country = args.country;
    if (args.entities !== undefined) patch.entities = args.entities;
    await ctx.db.patch(args.assetId, patch);
    await writeAudit(ctx, {
      orgId: existing.orgId,
      actorUserId: user._id,
      action: "asset.update",
      targetType: "asset",
      targetId: args.assetId,
      metadata: { fields: Object.keys(patch).filter((k) => k !== "updatedAt") },
    });
    return { ok: true as const };
  },
});

export const remove = mutation({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.assetId);
    if (!existing || existing.deletedAt) throw new Error("Asset not found");
    const { user } = await requireOrgRole(ctx, existing.orgId, "analyst");
    const now = Date.now();
    await ctx.db.patch(args.assetId, { deletedAt: now });
    // Soft-delete any links touching this asset.
    const links = await ctx.db
      .query("assetLinks")
      .withIndex("by_org", (q) => q.eq("orgId", existing.orgId))
      .collect();
    for (const l of links) {
      if (!l.deletedAt && (l.fromAssetId === args.assetId || l.toAssetId === args.assetId)) {
        await ctx.db.patch(l._id, { deletedAt: now });
      }
    }
    await writeAudit(ctx, {
      orgId: existing.orgId,
      actorUserId: user._id,
      action: "asset.delete",
      targetType: "asset",
      targetId: args.assetId,
      metadata: { name: existing.name },
    });
    return { ok: true as const };
  },
});

export const listLinks = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const rows = await ctx.db
      .query("assetLinks")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return rows
      .filter((l) => !l.deletedAt)
      .map((l) => ({ id: l._id, fromAssetId: l.fromAssetId, toAssetId: l.toAssetId, weight: l.weight }));
  },
});

export const createLink = mutation({
  args: {
    orgId: v.id("organizations"),
    fromAssetId: v.id("assets"),
    toAssetId: v.id("assets"),
    weight: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgRole(ctx, args.orgId, "analyst");
    if (args.fromAssetId === args.toAssetId) throw new Error("An asset cannot depend on itself");
    for (const id of [args.fromAssetId, args.toAssetId]) {
      const a = await ctx.db.get(id);
      if (!a || a.deletedAt || a.orgId !== args.orgId) throw new Error("Asset not found in this organization");
    }
    const weight = Math.max(0, Math.min(1, args.weight));
    const id = await ctx.db.insert("assetLinks", {
      orgId: args.orgId,
      fromAssetId: args.fromAssetId,
      toAssetId: args.toAssetId,
      weight,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      orgId: args.orgId,
      actorUserId: user._id,
      action: "assetLink.create",
      targetType: "assetLink",
      targetId: id,
      metadata: { weight },
    });
    return { id };
  },
});

export const removeLink = mutation({
  args: { linkId: v.id("assetLinks") },
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.linkId);
    if (!l || l.deletedAt) throw new Error("Link not found");
    await requireOrgRole(ctx, l.orgId, "analyst");
    await ctx.db.patch(args.linkId, { deletedAt: Date.now() });
    return { ok: true as const };
  },
});

const signalValidator = v.object({
  severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical")),
  title: v.string(),
  countries: v.optional(v.array(v.string())),
  companies: v.optional(v.array(v.string())),
  topics: v.optional(v.array(v.string())),
});

/**
 * Assess business impact of signals against the org's asset graph. When
 * `signals` is omitted, derives them from recent alert events.
 */
export const assess = query({
  args: { orgId: v.id("organizations"), signals: v.optional(v.array(signalValidator)) },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");

    const assetDocs = (
      await ctx.db.query("assets").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect()
    ).filter((a) => !a.deletedAt);
    const linkDocs = (
      await ctx.db.query("assetLinks").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect()
    ).filter((l) => !l.deletedAt);

    let signals: ImpactSignal[];
    if (args.signals && args.signals.length > 0) {
      signals = args.signals as ImpactSignal[];
    } else {
      const events = await ctx.db
        .query("alertEvents")
        .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
        .order("desc")
        .take(40);
      signals = events.map((e) => ({
        severity: e.severity as Severity,
        title: e.title,
        topics: e.matched,
      }));
    }

    const nodes: AssetNode[] = assetDocs.map((a) => ({
      id: a._id,
      name: a.name,
      type: a.type,
      criticality: a.criticality,
      revenueAtRisk: a.revenueAtRisk,
      entities: a.entities,
    }));
    const edges: AssetEdge[] = linkDocs.map((l) => ({
      fromAssetId: l.fromAssetId,
      toAssetId: l.toAssetId,
      weight: l.weight,
    }));

    return computeImpact(nodes, edges, signals);
  },
});
