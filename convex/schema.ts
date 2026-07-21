import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  registrations: defineTable({
    email: v.string(),
    normalizedEmail: v.string(),
    registeredAt: v.number(),
    source: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    referralCode: v.optional(v.string()),
    referredBy: v.optional(v.string()),
    referralCount: v.optional(v.number()),
  })
    .index("by_normalized_email", ["normalizedEmail"])
    .index("by_referral_code", ["referralCode"]),
  contactMessages: defineTable({
    name: v.string(),
    email: v.string(),
    organization: v.optional(v.string()),
    phone: v.optional(v.string()),
    message: v.optional(v.string()),
    source: v.string(),
    receivedAt: v.number(),
  }),
  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  // ------------------------------------------------------------------
  // SentinelIQ enterprise tier — multi-tenant foundation
  // (users, organizations, RBAC memberships, watchlists, alerts, audit).
  // Soft deletes via optional `deletedAt`; queries filter it out.
  // ------------------------------------------------------------------

  // A user identity, keyed by the auth provider's stable `subject`.
  users: defineTable({
    subject: v.string(), // auth identity subject (e.g. Clerk user id)
    email: v.string(),
    normalizedEmail: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_subject", ["subject"])
    .index("by_normalized_email", ["normalizedEmail"]),

  // A tenant. Every enterprise resource is scoped to an organization.
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_creator", ["createdByUserId"]),

  // RBAC: which users belong to which org, and at what role.
  // Role rank: viewer < analyst < admin < owner (see convex/lib/rbac.ts).
  memberships: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("analyst"),
      v.literal("viewer"),
    ),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"])
    .index("by_org_user", ["orgId", "userId"]),

  // Company / country / topic watchlists, scoped to an org.
  watchlists: defineTable({
    orgId: v.id("organizations"),
    createdByUserId: v.id("users"),
    name: v.string(),
    kind: v.union(
      v.literal("company"),
      v.literal("country"),
      v.literal("topic"),
      v.literal("mixed"),
    ),
    items: v.array(
      v.object({
        type: v.union(
          v.literal("company"),
          v.literal("country"),
          v.literal("topic"),
        ),
        value: v.string(), // e.g. ISO country code, ticker, or keyword
        label: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  // Saved alert definitions (evaluated by the alerts engine — future milestone).
  alerts: defineTable({
    orgId: v.id("organizations"),
    createdByUserId: v.id("users"),
    name: v.string(),
    watchlistId: v.optional(v.id("watchlists")),
    minSeverity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical"),
    ),
    channels: v.array(
      v.union(
        v.literal("email"),
        v.literal("slack"),
        v.literal("webhook"),
        v.literal("in_app"),
      ),
    ),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  // Immutable audit trail. Every mutating action appends one row.
  auditLogs: defineTable({
    orgId: v.id("organizations"),
    actorUserId: v.id("users"),
    action: v.string(), // e.g. "watchlist.create"
    targetType: v.string(), // e.g. "watchlist"
    targetId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),
});
