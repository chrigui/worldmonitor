import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgRole } from "./lib/auth";

/** Recent audit entries for an org, with actor display names. Any member. */
export const listForOrg = query({
  args: { orgId: v.id("organizations"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .order("desc")
      .take(Math.min(args.limit ?? 25, 100));

    const nameCache = new Map<string, string>();
    const out = [];
    for (const r of rows) {
      let actor = nameCache.get(r.actorUserId);
      if (!actor) {
        const u = await ctx.db.get(r.actorUserId);
        actor = u?.name ?? u?.email ?? "Unknown";
        nameCache.set(r.actorUserId, actor);
      }
      out.push({ id: r._id, action: r.action, actor, at: r.createdAt });
    }
    return out;
  },
});
