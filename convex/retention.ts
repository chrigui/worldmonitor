import { internalMutation } from "./_generated/server";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DELETES_PER_TABLE = 300; // bound work per run

/**
 * Enforce per-org data retention: delete audit logs and alert events older than
 * each org's configured retention. Bounded per run; the daily cron catches up
 * over successive runs. Only orgs with an explicit settings row are purged.
 */
export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const settings = await ctx.db.query("orgSettings").collect();
    let auditDeleted = 0;
    let eventDeleted = 0;

    for (const s of settings) {
      const auditCutoff = now - s.auditRetentionDays * DAY_MS;
      const audits = await ctx.db
        .query("auditLogs")
        .withIndex("by_org", (q) => q.eq("orgId", s.orgId))
        .collect();
      let n = 0;
      for (const a of audits) {
        if (a.createdAt < auditCutoff) {
          await ctx.db.delete(a._id);
          auditDeleted++;
          if (++n >= MAX_DELETES_PER_TABLE) break;
        }
      }

      const eventCutoff = now - s.eventRetentionDays * DAY_MS;
      const events = await ctx.db
        .query("alertEvents")
        .withIndex("by_org", (q) => q.eq("orgId", s.orgId))
        .collect();
      let m = 0;
      for (const e of events) {
        if (e.createdAt < eventCutoff) {
          await ctx.db.delete(e._id);
          eventDeleted++;
          if (++m >= MAX_DELETES_PER_TABLE) break;
        }
      }
    }
    return { auditDeleted, eventDeleted };
  },
});
