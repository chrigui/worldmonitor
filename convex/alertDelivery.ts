import { internalAction, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type DeliveryTarget = { type: "slack" | "webhook" | "email"; target: string };
interface DeliveryEvent {
  eventId: Id<"alertEvents">;
  severity: string;
  title: string;
  url: string | null;
  source: string | null;
  matched: string[];
  alertName: string;
  targets: DeliveryTarget[];
}

/** Gather undelivered events with their org's enabled delivery targets. */
export const getDeliveryBatch = internalQuery({
  args: { eventIds: v.array(v.id("alertEvents")) },
  handler: async (ctx, { eventIds }): Promise<DeliveryEvent[]> => {
    const targetsCache = new Map<string, DeliveryTarget[]>();
    const out: DeliveryEvent[] = [];
    for (const id of eventIds) {
      const e = await ctx.db.get(id);
      if (!e || e.deliveredAt) continue;
      let targets = targetsCache.get(e.orgId);
      if (!targets) {
        targets = (
          await ctx.db
            .query("notificationTargets")
            .withIndex("by_org", (q) => q.eq("orgId", e.orgId))
            .collect()
        )
          .filter((t) => !t.deletedAt && t.enabled)
          .map((t) => ({ type: t.type, target: t.target }));
        targetsCache.set(e.orgId, targets);
      }
      const alert = await ctx.db.get(e.alertId);
      out.push({
        eventId: e._id,
        severity: e.severity,
        title: e.title,
        url: e.url ?? null,
        source: e.source ?? null,
        matched: e.matched,
        alertName: alert?.name ?? "Alert",
        targets,
      });
    }
    return out;
  },
});

/** Mark events as delivery-attempted (idempotent). */
export const markDelivered = internalMutation({
  args: { eventIds: v.array(v.id("alertEvents")) },
  handler: async (ctx, { eventIds }) => {
    const now = Date.now();
    for (const id of eventIds) {
      const e = await ctx.db.get(id);
      if (e && !e.deliveredAt) await ctx.db.patch(id, { deliveredAt: now });
    }
  },
});

function formatMessage(e: DeliveryEvent): string {
  const parts = [`${e.alertName} — ${e.severity.toUpperCase()}`, e.title];
  if (e.source) parts.push(`Source: ${e.source}`);
  if (e.matched.length) parts.push(`Matched: ${e.matched.join(", ")}`);
  if (e.url) parts.push(e.url);
  return parts.join("\n");
}

async function dispatch(t: DeliveryTarget, e: DeliveryEvent): Promise<void> {
  if (t.type === "slack") {
    await fetch(t.target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `:rotating_light: ${formatMessage(e)}` }),
    });
  } else if (t.type === "webhook") {
    await fetch(t.target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "sentineliq.alert",
        severity: e.severity,
        alert: e.alertName,
        title: e.title,
        source: e.source,
        url: e.url,
        matched: e.matched,
      }),
    });
  } else if (t.type === "email") {
    // Email via Resend, only when configured — otherwise a no-op (not an error).
    const key = process.env.RESEND_API_KEY;
    const from = process.env.SENTINELIQ_ALERT_FROM;
    if (!key || !from) return;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: t.target,
        subject: `[SentinelIQ] ${e.severity.toUpperCase()}: ${e.alertName}`,
        text: formatMessage(e),
      }),
    });
  }
}

/**
 * Deliver a batch of new alert events to each org's enabled channels. Scheduled
 * by the evaluation engine. Failures on one target don't block the others; every
 * event is marked delivery-attempted afterward to avoid retry storms.
 */
export const deliverEvents = internalAction({
  args: { eventIds: v.array(v.id("alertEvents")) },
  handler: async (ctx, { eventIds }) => {
    const batch: DeliveryEvent[] = await ctx.runQuery(
      internal.alertDelivery.getDeliveryBatch,
      { eventIds },
    );
    const delivered: Id<"alertEvents">[] = [];
    for (const e of batch) {
      for (const t of e.targets) {
        try {
          await dispatch(t, e);
        } catch (err) {
          console.error(`[alertDelivery] ${t.type} failed:`, err);
        }
      }
      delivered.push(e.eventId);
    }
    if (delivered.length) {
      await ctx.runMutation(internal.alertDelivery.markDelivered, { eventIds: delivered });
    }
    return { delivered: delivered.length };
  },
});
