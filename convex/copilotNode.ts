"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import Anthropic from "@anthropic-ai/sdk";
import type { Source } from "./copilot";

interface Citation {
  sourceIndex: number;
  quote: string;
  title?: string;
  url?: string;
}
interface Answer {
  answer: string;
  citations: Citation[];
  confidence: number;
}

const SYSTEM = `You are SentinelIQ Copilot, an enterprise risk-intelligence assistant.
Answer the user's question ONLY from the numbered SOURCES provided. Each source is
evidence drawn from the organization's alert events and watchlists.
Rules:
- Ground every claim in the sources; cite them by their numeric index.
- If the sources do not contain enough evidence to answer, say so plainly and set
  a low confidence — do not speculate or use outside knowledge.
- confidence is your calibrated 0..1 estimate that the answer is well-supported.
- Keep the answer concise and decision-oriented for a risk analyst.`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    confidence: { type: "number" },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceIndex: { type: "integer" },
          quote: { type: "string" },
        },
        required: ["sourceIndex", "quote"],
      },
    },
  },
  required: ["answer", "confidence", "citations"],
} as const;

function renderSources(sources: Source[]): string {
  if (sources.length === 0) return "(no sources available)";
  return sources
    .map((s) => `[${s.index}] (${s.kind}) ${s.title} — ${s.detail}${s.url ? ` <${s.url}>` : ""}`)
    .join("\n");
}

async function generateAnswer(question: string, sources: Source[]): Promise<Answer> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      answer:
        "The AI Copilot is not configured. Set ANTHROPIC_API_KEY in the Convex deployment to enable grounded answers.",
      citations: [],
      confidence: 0,
    };
  }
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `SOURCES:\n${renderSources(sources)}\n\nQUESTION: ${question}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    return { answer: "No answer was produced.", citations: [], confidence: 0 };
  }
  const parsed = JSON.parse(text.text) as Answer;

  // Enrich citations with the source's title/url for display.
  const byIndex = new Map(sources.map((s) => [s.index, s]));
  const citations: Citation[] = (parsed.citations ?? [])
    .filter((c) => byIndex.has(c.sourceIndex))
    .map((c) => {
      const src = byIndex.get(c.sourceIndex)!;
      return { sourceIndex: c.sourceIndex, quote: c.quote, title: src.title, url: src.url ?? undefined };
    });
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  return { answer: String(parsed.answer ?? ""), citations, confidence };
}

/**
 * Ask the copilot a question. Records the user turn, retrieves org-scoped
 * grounding context, generates a cited answer with Claude, and records it.
 */
export const ask = action({
  args: {
    orgId: v.id("organizations"),
    threadId: v.optional(v.id("copilotThreads")),
    question: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const question = args.question.trim();
    if (!question) throw new Error("Question is required");

    const threadId: Id<"copilotThreads"> = await ctx.runMutation(
      internal.copilot.recordUserMessage,
      { orgId: args.orgId, threadId: args.threadId, question },
    );
    const sources: Source[] = await ctx.runQuery(internal.copilot.retrieveContext, {
      orgId: args.orgId,
    });
    const result = await generateAnswer(question, sources);
    await ctx.runMutation(internal.copilot.recordAssistantMessage, {
      threadId,
      orgId: args.orgId,
      content: result.answer,
      citations: result.citations,
      confidence: result.confidence,
    });
    return { threadId, ...result };
  },
});
