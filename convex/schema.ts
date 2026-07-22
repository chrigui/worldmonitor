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

  // Pending invitations. Resolved into a membership when the invited email
  // first signs in (see users.upsertFromIdentity).
  invitations: defineTable({
    orgId: v.id("organizations"),
    email: v.string(),
    normalizedEmail: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("analyst"),
      v.literal("viewer"),
    ),
    invitedByUserId: v.id("users"),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_email", ["normalizedEmail"]),

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

  // Matches produced by the alerts evaluation engine (one per signal×alert hit).
  alertEvents: defineTable({
    orgId: v.id("organizations"),
    alertId: v.id("alerts"),
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical"),
    ),
    title: v.string(),
    url: v.optional(v.string()),
    source: v.optional(v.string()),
    matched: v.array(v.string()), // watchlist item values that matched
    createdAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
    acknowledgedByUserId: v.optional(v.id("users")),
    deliveredAt: v.optional(v.number()), // set once delivery has been attempted
  })
    .index("by_org", ["orgId"])
    .index("by_alert", ["alertId"]),

  // Per-org delivery destinations for alert events (Slack / webhook / email).
  notificationTargets: defineTable({
    orgId: v.id("organizations"),
    type: v.union(v.literal("slack"), v.literal("webhook"), v.literal("email")),
    target: v.string(), // Slack/webhook URL, or email address
    label: v.optional(v.string()),
    enabled: v.boolean(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  // Business-impact asset graph: nodes (assets) + directed dependency edges.
  assets: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    type: v.union(
      v.literal("supplier"),
      v.literal("facility"),
      v.literal("route"),
      v.literal("product"),
      v.literal("market"),
      v.literal("other"),
    ),
    criticality: v.union(v.literal("tier1"), v.literal("tier2"), v.literal("tier3")),
    revenueAtRisk: v.optional(v.number()), // annualized $ exposure if fully disrupted
    country: v.optional(v.string()),
    // Entities this asset is exposed to; a signal matching these hits the asset.
    entities: v.array(
      v.object({
        type: v.union(v.literal("company"), v.literal("country"), v.literal("topic")),
        value: v.string(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  // Directed edge: `toAsset` depends on `fromAsset`; impact propagates from → to.
  assetLinks: defineTable({
    orgId: v.id("organizations"),
    fromAssetId: v.id("assets"),
    toAssetId: v.id("assets"),
    weight: v.number(), // 0..1 impact transmission
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  // AI Copilot conversation threads + messages (RAG over the org's intelligence).
  copilotThreads: defineTable({
    orgId: v.id("organizations"),
    createdByUserId: v.id("users"),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  copilotMessages: defineTable({
    threadId: v.id("copilotThreads"),
    orgId: v.id("organizations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    // Grounding citations attached to assistant answers.
    citations: v.optional(
      v.array(
        v.object({
          sourceIndex: v.number(),
          quote: v.string(),
          title: v.optional(v.string()),
          url: v.optional(v.string()),
        }),
      ),
    ),
    confidence: v.optional(v.number()), // 0..1
    createdAt: v.number(),
  }).index("by_thread", ["threadId"]),

  // Generated executive briefs (AI summary + rendered HTML), on-demand or scheduled.
  reports: defineTable({
    orgId: v.id("organizations"),
    generatedByUserId: v.optional(v.id("users")),
    title: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
    summary: v.string(),
    keyJudgements: v.array(v.string()),
    recommendations: v.array(v.string()),
    totalRevenueAtRisk: v.number(),
    eventCount: v.number(),
    html: v.string(), // self-contained, printable
    source: v.union(v.literal("manual"), v.literal("scheduled")),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),

  // Per-org compliance settings (retention + SSO enforcement flag).
  orgSettings: defineTable({
    orgId: v.id("organizations"),
    auditRetentionDays: v.number(),
    eventRetentionDays: v.number(),
    requireSso: v.boolean(),
    updatedAt: v.number(),
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
