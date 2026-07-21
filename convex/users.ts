import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireIdentity, getCurrentUser, getMembership } from "./lib/auth";
import { writeAudit } from "./lib/audit";

/**
 * Turn any pending invitations for this email into active memberships.
 * Idempotent: skips invites already accepted and orgs already joined.
 */
async function resolvePendingInvites(
  ctx: MutationCtx,
  userId: Id<"users">,
  normalizedEmail: string,
): Promise<number> {
  if (!normalizedEmail) return 0;
  const invites = await ctx.db
    .query("invitations")
    .withIndex("by_email", (q) => q.eq("normalizedEmail", normalizedEmail))
    .collect();

  let accepted = 0;
  const now = Date.now();
  for (const invite of invites) {
    if (invite.acceptedAt || invite.deletedAt) continue;
    const org = await ctx.db.get(invite.orgId);
    if (!org || org.deletedAt) continue;
    const already = await getMembership(ctx, userId, invite.orgId);
    if (!already) {
      await ctx.db.insert("memberships", {
        orgId: invite.orgId,
        userId,
        role: invite.role,
        createdAt: now,
      });
      await writeAudit(ctx, {
        orgId: invite.orgId,
        actorUserId: userId,
        action: "invitation.accept",
        targetType: "membership",
        metadata: { role: invite.role },
      });
    }
    await ctx.db.patch(invite._id, { acceptedAt: now });
    accepted++;
  }
  return accepted;
}

/**
 * Sync the authenticated identity into a `users` row. Idempotent — call after
 * login. Creates the row on first sight, otherwise refreshes profile fields,
 * then resolves any pending org invitations for this email.
 */
export const upsertFromIdentity = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const email = (identity.email ?? "").trim();
    const normalizedEmail = email.toLowerCase();
    const now = Date.now();

    const existing = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
      .first();

    let userId: Id<"users">;
    let created: boolean;
    if (existing) {
      await ctx.db.patch(existing._id, {
        email: email || existing.email,
        normalizedEmail: normalizedEmail || existing.normalizedEmail,
        name: identity.name ?? existing.name,
        avatarUrl: identity.pictureUrl ?? existing.avatarUrl,
        lastSeenAt: now,
        deletedAt: undefined,
      });
      userId = existing._id;
      created = false;
    } else {
      userId = await ctx.db.insert("users", {
        subject: identity.subject,
        email,
        normalizedEmail,
        name: identity.name,
        avatarUrl: identity.pictureUrl,
        createdAt: now,
        lastSeenAt: now,
      });
      created = true;
    }

    const invitesAccepted = await resolvePendingInvites(ctx, userId, normalizedEmail);
    return { userId, created, invitesAccepted };
  },
});

/** The current user's profile, or null if unauthenticated / not provisioned. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      id: user._id,
      email: user.email,
      name: user.name ?? null,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: user.createdAt,
    };
  },
});
