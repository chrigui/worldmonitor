// Append-only audit trail helper. Every mutating enterprise action records
// one row so admins can review who did what, when.

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function writeAudit(
  ctx: MutationCtx,
  entry: {
    orgId: Id<"organizations">;
    actorUserId: Id<"users">;
    action: string;
    targetType: string;
    targetId?: string;
    metadata?: unknown;
  },
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    orgId: entry.orgId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata,
    createdAt: Date.now(),
  });
}
