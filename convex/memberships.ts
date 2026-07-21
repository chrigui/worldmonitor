import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOrgRole } from "./lib/auth";
import { writeAudit } from "./lib/audit";
import { roleAtLeast, type Role } from "./lib/rbac";

const roleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("analyst"),
  v.literal("viewer"),
);

/** Active (non-deleted) memberships for an org. */
async function activeMemberships(ctx: QueryCtx | MutationCtx, orgId: Id<"organizations">) {
  const rows = await ctx.db
    .query("memberships")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  return rows.filter((m) => !m.deletedAt);
}

/** List members (with profile) and pending invitations for an org. Any member. */
export const listForOrg = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");

    const members = [];
    for (const m of await activeMemberships(ctx, args.orgId)) {
      const user = await ctx.db.get(m.userId);
      if (!user) continue;
      members.push({
        membershipId: m._id,
        userId: user._id,
        name: user.name ?? null,
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
        role: m.role as Role,
        joinedAt: m.createdAt,
      });
    }

    const invites = await ctx.db
      .query("invitations")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const pendingInvites = invites
      .filter((i) => !i.acceptedAt && !i.deletedAt)
      .map((i) => ({
        invitationId: i._id,
        email: i.email,
        role: i.role as Role,
        invitedAt: i.createdAt,
      }));

    return { members, pendingInvites };
  },
});

/**
 * Invite a user by email at a given role (admin+). If the user already exists,
 * they're added directly; otherwise a pending invitation is stored and resolved
 * on their next login. You cannot grant a role higher than your own.
 */
export const invite = mutation({
  args: { orgId: v.id("organizations"), email: v.string(), role: roleValidator },
  handler: async (ctx, args) => {
    const { user: actor, membership: actorMembership } = await requireOrgRole(
      ctx,
      args.orgId,
      "admin",
    );
    if (!roleAtLeast(actorMembership.role as Role, args.role)) {
      throw new Error("Cannot grant a role higher than your own");
    }
    const email = args.email.trim();
    const normalizedEmail = email.toLowerCase();
    if (!normalizedEmail) throw new Error("Email is required");

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_normalized_email", (q) => q.eq("normalizedEmail", normalizedEmail))
      .first();

    if (existingUser && !existingUser.deletedAt) {
      const existingMembership = await ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", args.orgId).eq("userId", existingUser._id),
        )
        .first();
      if (existingMembership && !existingMembership.deletedAt) {
        throw new Error("User is already a member of this organization");
      }
      if (existingMembership) {
        await ctx.db.patch(existingMembership._id, {
          role: args.role,
          deletedAt: undefined,
        });
      } else {
        await ctx.db.insert("memberships", {
          orgId: args.orgId,
          userId: existingUser._id,
          role: args.role,
          createdAt: Date.now(),
        });
      }
      await writeAudit(ctx, {
        orgId: args.orgId,
        actorUserId: actor._id,
        action: "membership.add",
        targetType: "user",
        targetId: existingUser._id,
        metadata: { email: normalizedEmail, role: args.role },
      });
      return { status: "added" as const };
    }

    // No user yet — upsert a pending invitation (dedupe by org+email).
    const existingInvite = (
      await ctx.db
        .query("invitations")
        .withIndex("by_email", (q) => q.eq("normalizedEmail", normalizedEmail))
        .collect()
    ).find((i) => i.orgId === args.orgId && !i.acceptedAt && !i.deletedAt);

    if (existingInvite) {
      await ctx.db.patch(existingInvite._id, { role: args.role });
    } else {
      await ctx.db.insert("invitations", {
        orgId: args.orgId,
        email,
        normalizedEmail,
        role: args.role,
        invitedByUserId: actor._id,
        createdAt: Date.now(),
      });
    }
    await writeAudit(ctx, {
      orgId: args.orgId,
      actorUserId: actor._id,
      action: "invitation.create",
      targetType: "invitation",
      metadata: { email: normalizedEmail, role: args.role },
    });
    return { status: "invited" as const };
  },
});

/** Change a member's role (admin+). Protects the last owner and blocks escalation. */
export const updateRole = mutation({
  args: { membershipId: v.id("memberships"), role: roleValidator },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.membershipId);
    if (!target || target.deletedAt) throw new Error("Membership not found");
    const { user: actor, membership: actorMembership } = await requireOrgRole(
      ctx,
      target.orgId,
      "admin",
    );
    const actorRole = actorMembership.role as Role;

    if (!roleAtLeast(actorRole, target.role as Role)) {
      throw new Error("Cannot modify a member with a higher role than yours");
    }
    if (!roleAtLeast(actorRole, args.role)) {
      throw new Error("Cannot grant a role higher than your own");
    }
    if (target.role === "owner" && args.role !== "owner") {
      const owners = (await activeMemberships(ctx, target.orgId)).filter(
        (m) => m.role === "owner",
      );
      if (owners.length <= 1) throw new Error("Cannot demote the last owner");
    }

    await ctx.db.patch(args.membershipId, { role: args.role });
    await writeAudit(ctx, {
      orgId: target.orgId,
      actorUserId: actor._id,
      action: "membership.updateRole",
      targetType: "membership",
      targetId: args.membershipId,
      metadata: { from: target.role, to: args.role },
    });
    return { ok: true as const };
  },
});

/** Remove a member (admin+). Protects the last owner and blocks removing superiors. */
export const remove = mutation({
  args: { membershipId: v.id("memberships") },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.membershipId);
    if (!target || target.deletedAt) throw new Error("Membership not found");
    const { user: actor, membership: actorMembership } = await requireOrgRole(
      ctx,
      target.orgId,
      "admin",
    );
    if (!roleAtLeast(actorMembership.role as Role, target.role as Role)) {
      throw new Error("Cannot remove a member with a higher role than yours");
    }
    if (target.role === "owner") {
      const owners = (await activeMemberships(ctx, target.orgId)).filter(
        (m) => m.role === "owner",
      );
      if (owners.length <= 1) throw new Error("Cannot remove the last owner");
    }

    await ctx.db.patch(args.membershipId, { deletedAt: Date.now() });
    await writeAudit(ctx, {
      orgId: target.orgId,
      actorUserId: actor._id,
      action: "membership.remove",
      targetType: "membership",
      targetId: args.membershipId,
      metadata: { role: target.role, userId: target.userId },
    });
    return { ok: true as const };
  },
});

/** Revoke a pending invitation (admin+). */
export const revokeInvite = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.invitationId);
    if (!invite || invite.deletedAt || invite.acceptedAt) {
      throw new Error("Invitation not found");
    }
    const { user: actor } = await requireOrgRole(ctx, invite.orgId, "admin");
    await ctx.db.patch(args.invitationId, { deletedAt: Date.now() });
    await writeAudit(ctx, {
      orgId: invite.orgId,
      actorUserId: actor._id,
      action: "invitation.revoke",
      targetType: "invitation",
      targetId: args.invitationId,
      metadata: { email: invite.normalizedEmail },
    });
    return { ok: true as const };
  },
});
