// Identity + org-scoped authorization helpers shared by all enterprise
// Convex functions. These read the authenticated identity from `ctx.auth`,
// which is populated once an auth provider (e.g. Clerk) is configured in
// convex/auth.config.ts. Until then, authenticated calls throw "Not
// authenticated" — the functions are correct, they just require login.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { roleAtLeast, type Role } from "./rbac";

type Ctx = QueryCtx | MutationCtx;

/** The auth identity, or throw if the caller is unauthenticated. */
export async function requireIdentity(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

/** The current user row (by auth subject), or null if not yet provisioned. */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
    .first();
  if (!user || user.deletedAt) return null;
  return user;
}

/** The current user row, or throw if unauthenticated / not provisioned. */
export async function requireCurrentUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new Error("User not provisioned — call users.upsertFromIdentity first");
  }
  return user;
}

/** The caller's active membership in `orgId`, or null. */
export async function getMembership(
  ctx: Ctx,
  userId: Id<"users">,
  orgId: Id<"organizations">,
): Promise<Doc<"memberships"> | null> {
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
    .first();
  if (!membership || membership.deletedAt) return null;
  return membership;
}

/**
 * Assert the caller is a member of `orgId` with at least `minRole`.
 * Returns the resolved user + membership for convenience.
 */
export async function requireOrgRole(
  ctx: Ctx,
  orgId: Id<"organizations">,
  minRole: Role,
): Promise<{ user: Doc<"users">; membership: Doc<"memberships"> }> {
  const user = await requireCurrentUser(ctx);
  const membership = await getMembership(ctx, user._id, orgId);
  if (!membership) {
    throw new Error("Forbidden — not a member of this organization");
  }
  if (!roleAtLeast(membership.role as Role, minRole)) {
    throw new Error(`Forbidden — requires ${minRole} role or higher`);
  }
  return { user, membership };
}
