import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireOrgRole } from "./lib/auth";
import { writeAudit } from "./lib/audit";

const citationValidator = v.object({
  sourceIndex: v.number(),
  quote: v.string(),
  title: v.optional(v.string()),
  url: v.optional(v.string()),
});

export interface Source {
  index: number;
  kind: "alert_event" | "watchlist";
  title: string;
  detail: string;
  url: string | null;
}

/**
 * Retrieve grounding context for a question, scoped to the org: recent alert
 * events (the concrete evidence) plus the org's watchlist entities. Auth
 * propagates from the calling action, so requireOrgRole works here.
 */
export const retrieveContext = internalQuery({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args): Promise<Source[]> => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const sources: Source[] = [];
    let i = 0;

    const events = await ctx.db
      .query("alertEvents")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .order("desc")
      .take(24);
    for (const e of events) {
      sources.push({
        index: i++,
        kind: "alert_event",
        title: e.title,
        detail: `severity=${e.severity}` +
          (e.source ? `; source=${e.source}` : "") +
          (e.matched.length ? `; matched=${e.matched.join(", ")}` : ""),
        url: e.url ?? null,
      });
    }

    const watchlists = await ctx.db
      .query("watchlists")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    for (const w of watchlists) {
      if (w.deletedAt) continue;
      sources.push({
        index: i++,
        kind: "watchlist",
        title: `Watchlist: ${w.name}`,
        detail: w.items.map((it) => it.label ?? it.value).join(", ") || "(empty)",
        url: null,
      });
    }
    return sources;
  },
});

/** Create/append a user turn, creating the thread on first message. */
export const recordUserMessage = internalMutation({
  args: {
    orgId: v.id("organizations"),
    threadId: v.optional(v.id("copilotThreads")),
    question: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"copilotThreads">> => {
    const { user } = await requireOrgRole(ctx, args.orgId, "viewer");
    const now = Date.now();
    let threadId = args.threadId;
    if (threadId) {
      const t = await ctx.db.get(threadId);
      if (!t || t.deletedAt || t.orgId !== args.orgId) throw new Error("Thread not found");
      await ctx.db.patch(threadId, { updatedAt: now });
    } else {
      threadId = await ctx.db.insert("copilotThreads", {
        orgId: args.orgId,
        createdByUserId: user._id,
        title: args.question.slice(0, 80),
        createdAt: now,
        updatedAt: now,
      });
      await writeAudit(ctx, {
        orgId: args.orgId,
        actorUserId: user._id,
        action: "copilot.thread.create",
        targetType: "copilotThread",
        targetId: threadId,
      });
    }
    await ctx.db.insert("copilotMessages", {
      threadId,
      orgId: args.orgId,
      role: "user",
      content: args.question,
      createdAt: now,
    });
    return threadId;
  },
});

/** Append the assistant's grounded answer. */
export const recordAssistantMessage = internalMutation({
  args: {
    threadId: v.id("copilotThreads"),
    orgId: v.id("organizations"),
    content: v.string(),
    citations: v.optional(v.array(citationValidator)),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("copilotMessages", {
      threadId: args.threadId,
      orgId: args.orgId,
      role: "assistant",
      content: args.content,
      citations: args.citations,
      confidence: args.confidence,
      createdAt: Date.now(),
    });
  },
});

/** List an org's copilot threads (any member). */
export const listThreads = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "viewer");
    const rows = await ctx.db
      .query("copilotThreads")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .order("desc")
      .collect();
    return rows
      .filter((t) => !t.deletedAt)
      .map((t) => ({ id: t._id, title: t.title, updatedAt: t.updatedAt }));
  },
});

/** Messages for a thread (any member of its org). */
export const getMessages = query({
  args: { threadId: v.id("copilotThreads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.deletedAt) return [];
    await requireOrgRole(ctx, thread.orgId, "viewer");
    const rows = await ctx.db
      .query("copilotMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
    return rows.map((m) => ({
      id: m._id,
      role: m.role,
      content: m.content,
      citations: m.citations ?? [],
      confidence: m.confidence ?? null,
      createdAt: m.createdAt,
    }));
  },
});
