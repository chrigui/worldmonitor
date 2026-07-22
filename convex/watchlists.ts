import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireOrgRole } from "./lib/auth";
import { writeAudit } from "./lib/audit";

const itemValidator = v.object({
  type: v.union(v.literal("company"), v.literal("country"), v.literal("topic")),
  value: v.string(),
  label: v.optional(v.string()),
});

const kindValidator = v.union(
  v.literal("company"),
  v.literal("country"),
  v.literal("topic"),
  v.literal("mixed"),
);

function serialize(w: Doc<"watchlists">) {
  return {
    id: w._id,
    orgId: w.orgId,
    name: w.name,
    kind: w.kind,
    items: w.items,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

/** List an org's watchlists (any member). */
export const list = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const rows = await ctx.db
      .query("watchlists")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return rows.filter((w) => !w.deletedAt).map(serialize);
  },
});

/** Fetch a single watchlist (any member of its org). */
export const get = query({
  args: { watchlistId: v.id("watchlists") },
  handler: async (ctx, args) => {
    const w = await ctx.db.get(args.watchlistId);
    if (!w || w.deletedAt) return null;
    await requireOrgRole(ctx, w.orgId, "viewer");
    return serialize(w);
  },
});

/** Create a watchlist (analyst+). */
export const create = mutation({
  args: {
    orgId: v.id("organizations"),
    name: v.string(),
    kind: kindValidator,
    items: v.optional(v.array(itemValidator)),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgRole(ctx, args.orgId, "analyst");
    const name = args.name.trim();
    if (!name) throw new Error("Watchlist name is required");
    const now = Date.now();

    const watchlistId = await ctx.db.insert("watchlists", {
      orgId: args.orgId,
      createdByUserId: user._id,
      name,
      kind: args.kind,
      items: args.items ?? [],
      createdAt: now,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      orgId: args.orgId,
      actorUserId: user._id,
      action: "watchlist.create",
      targetType: "watchlist",
      targetId: watchlistId,
      metadata: { name, kind: args.kind, itemCount: args.items?.length ?? 0 },
    });

    return { watchlistId };
  },
});

/** Update a watchlist's name / kind / items (analyst+). */
export const update = mutation({
  args: {
    watchlistId: v.id("watchlists"),
    name: v.optional(v.string()),
    kind: v.optional(kindValidator),
    items: v.optional(v.array(itemValidator)),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.watchlistId);
    if (!existing || existing.deletedAt) throw new Error("Watchlist not found");
    const { user } = await requireOrgRole(ctx, existing.orgId, "analyst");

    const patch: {
      updatedAt: number;
      name?: string;
      kind?: Doc<"watchlists">["kind"];
      items?: Doc<"watchlists">["items"];
    } = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Watchlist name cannot be empty");
      patch.name = name;
    }
    if (args.kind !== undefined) patch.kind = args.kind;
    if (args.items !== undefined) patch.items = args.items;

    await ctx.db.patch(args.watchlistId, patch);

    await writeAudit(ctx, {
      orgId: existing.orgId,
      actorUserId: user._id,
      action: "watchlist.update",
      targetType: "watchlist",
      targetId: args.watchlistId,
      metadata: { fields: Object.keys(patch).filter((k) => k !== "updatedAt") },
    });

    return { ok: true as const };
  },
});

/** Soft-delete a watchlist (analyst+). */
export const remove = mutation({
  args: { watchlistId: v.id("watchlists") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.watchlistId);
    if (!existing || existing.deletedAt) throw new Error("Watchlist not found");
    const { user } = await requireOrgRole(ctx, existing.orgId, "analyst");

    await ctx.db.patch(args.watchlistId, { deletedAt: Date.now() });

    await writeAudit(ctx, {
      orgId: existing.orgId,
      actorUserId: user._id,
      action: "watchlist.delete",
      targetType: "watchlist",
      targetId: args.watchlistId,
      metadata: { name: existing.name },
    });

    return { ok: true as const };
  },
});
