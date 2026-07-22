import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgRole } from "./lib/auth";
import { writeAudit } from "./lib/audit";

const typeValidator = v.union(
  v.literal("slack"),
  v.literal("webhook"),
  v.literal("email"),
);

/** List an org's delivery targets (any member). */
export const list = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const rows = await ctx.db
      .query("notificationTargets")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return rows
      .filter((t) => !t.deletedAt)
      .map((t) => ({
        id: t._id,
        type: t.type,
        target: t.target,
        label: t.label ?? null,
        enabled: t.enabled,
      }));
  },
});

function validateTarget(type: "slack" | "webhook" | "email", target: string): string {
  const value = target.trim();
  if (!value) throw new Error("Target is required");
  if (type === "email") {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw new Error("Invalid email address");
  } else if (!/^https:\/\//.test(value)) {
    throw new Error("Webhook/Slack target must be an https URL");
  }
  return value;
}

/** Add a delivery target (admin+). */
export const create = mutation({
  args: { orgId: v.id("organizations"), type: typeValidator, target: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await requireOrgRole(ctx, args.orgId, "admin");
    const target = validateTarget(args.type, args.target);
    const id = await ctx.db.insert("notificationTargets", {
      orgId: args.orgId,
      type: args.type,
      target,
      label: args.label?.trim() || undefined,
      enabled: true,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      orgId: args.orgId,
      actorUserId: user._id,
      action: "notificationTarget.create",
      targetType: "notificationTarget",
      targetId: id,
      metadata: { type: args.type },
    });
    return { id };
  },
});

/** Enable/disable a target (admin+). */
export const setEnabled = mutation({
  args: { targetId: v.id("notificationTargets"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.targetId);
    if (!t || t.deletedAt) throw new Error("Target not found");
    await requireOrgRole(ctx, t.orgId, "admin");
    await ctx.db.patch(args.targetId, { enabled: args.enabled });
    return { ok: true as const };
  },
});

/** Remove a target (admin+). */
export const remove = mutation({
  args: { targetId: v.id("notificationTargets") },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.targetId);
    if (!t || t.deletedAt) throw new Error("Target not found");
    const { user } = await requireOrgRole(ctx, t.orgId, "admin");
    await ctx.db.patch(args.targetId, { deletedAt: Date.now() });
    await writeAudit(ctx, {
      orgId: t.orgId,
      actorUserId: user._id,
      action: "notificationTarget.remove",
      targetType: "notificationTarget",
      targetId: args.targetId,
      metadata: { type: t.type },
    });
    return { ok: true as const };
  },
});
