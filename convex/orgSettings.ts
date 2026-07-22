import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgRole } from "./lib/auth";
import { writeAudit } from "./lib/audit";

export const DEFAULTS = { auditRetentionDays: 365, eventRetentionDays: 90, requireSso: false };

/** Read an org's compliance settings (any member), falling back to defaults. */
export const get = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const row = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .first();
    return {
      auditRetentionDays: row?.auditRetentionDays ?? DEFAULTS.auditRetentionDays,
      eventRetentionDays: row?.eventRetentionDays ?? DEFAULTS.eventRetentionDays,
      requireSso: row?.requireSso ?? DEFAULTS.requireSso,
    };
  },
});

/** Update compliance settings (admin+). */
export const update = mutation({
  args: {
    orgId: v.id("organizations"),
    auditRetentionDays: v.optional(v.number()),
    eventRetentionDays: v.optional(v.number()),
    requireSso: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgRole(ctx, args.orgId, "admin");
    const clampDays = (n: number) => Math.max(1, Math.min(3650, Math.round(n)));
    const existing = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .first();
    const next = {
      auditRetentionDays: clampDays(args.auditRetentionDays ?? existing?.auditRetentionDays ?? DEFAULTS.auditRetentionDays),
      eventRetentionDays: clampDays(args.eventRetentionDays ?? existing?.eventRetentionDays ?? DEFAULTS.eventRetentionDays),
      requireSso: args.requireSso ?? existing?.requireSso ?? DEFAULTS.requireSso,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, next);
    else await ctx.db.insert("orgSettings", { orgId: args.orgId, ...next });

    await writeAudit(ctx, {
      orgId: args.orgId,
      actorUserId: user._id,
      action: "orgSettings.update",
      targetType: "orgSettings",
      metadata: { auditRetentionDays: next.auditRetentionDays, eventRetentionDays: next.eventRetentionDays, requireSso: next.requireSso },
    });
    return { ok: true as const };
  },
});
