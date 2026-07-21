import { mutation, query } from "./_generated/server";
import { requireIdentity, getCurrentUser } from "./lib/auth";

/**
 * Sync the authenticated identity into a `users` row. Idempotent — call after
 * login. Creates the row on first sight, otherwise refreshes profile fields.
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

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: email || existing.email,
        normalizedEmail: normalizedEmail || existing.normalizedEmail,
        name: identity.name ?? existing.name,
        avatarUrl: identity.pictureUrl ?? existing.avatarUrl,
        lastSeenAt: now,
        deletedAt: undefined,
      });
      return { userId: existing._id, created: false as const };
    }

    const userId = await ctx.db.insert("users", {
      subject: identity.subject,
      email,
      normalizedEmail,
      name: identity.name,
      avatarUrl: identity.pictureUrl,
      createdAt: now,
      lastSeenAt: now,
    });
    return { userId, created: true as const };
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
