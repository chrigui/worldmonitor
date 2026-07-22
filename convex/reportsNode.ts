"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import Anthropic from "@anthropic-ai/sdk";
import type { ReportData } from "./reports";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface AiSummary {
  executiveSummary: string;
  keyJudgements: string[];
  recommendations: string[];
}

const SYSTEM = `You are SentinelIQ's risk-intelligence briefer writing an executive brief for
enterprise leadership. Use ONLY the provided data (alert events + business-impact
assessment). Be concise, decision-oriented, and specific. Do not invent facts.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    executiveSummary: { type: "string" },
    keyJudgements: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "string" } },
  },
  required: ["executiveSummary", "keyJudgements", "recommendations"],
} as const;

function money(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}M` : `$${n}K`;
}

function fallbackSummary(data: ReportData): AiSummary {
  const top = data.impactRows[0];
  return {
    executiveSummary:
      `Over the reporting period, ${data.events.length} alert event(s) were recorded across ` +
      `${data.watchlistCount} watchlist(s) and ${data.alertCount} alert rule(s). ` +
      `Estimated revenue at risk is ${money(data.totalRevenueAtRisk)}` +
      (top ? `, led by ${top.name} (${(top.impact * 100).toFixed(0)}% impact).` : ".") +
      ` (AI narrative unavailable — set ANTHROPIC_API_KEY to enable.)`,
    keyJudgements: data.impactRows.slice(0, 4).map(
      (r) => `${r.name}: ${(r.impact * 100).toFixed(0)}% impact, ${money(r.revenueAtRisk)} at risk` +
        (r.direct ? " (direct)" : r.via ? ` (via ${r.via})` : ""),
    ),
    recommendations: [
      "Review the highest-impact assets and confirm mitigation owners.",
      "Tighten alert thresholds for entities with repeated events.",
      "Validate revenue-at-risk assumptions with the finance team.",
    ],
  };
}

async function generateSummary(data: ReportData): Promise<AiSummary> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackSummary(data);
  const client = new Anthropic();
  const context = {
    period: { start: new Date(data.periodStart).toISOString(), end: new Date(data.periodEnd).toISOString() },
    totalRevenueAtRisk: data.totalRevenueAtRisk,
    events: data.events.map((e) => ({ title: e.title, severity: e.severity, source: e.source, matched: e.matched })),
    impact: data.impactRows.map((r) => ({ asset: r.name, tier: r.criticality, impact: r.impact, revenueAtRisk: r.revenueAtRisk, direct: r.direct, via: r.via })),
    watchlistCount: data.watchlistCount,
    alertCount: data.alertCount,
  };
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `DATA:\n${JSON.stringify(context, null, 2)}\n\nWrite the executive brief.` }],
  });
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return fallbackSummary(data);
  try {
    const parsed = JSON.parse(text.text) as AiSummary;
    return {
      executiveSummary: String(parsed.executiveSummary ?? ""),
      keyJudgements: Array.isArray(parsed.keyJudgements) ? parsed.keyJudgements.map(String) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
    };
  } catch {
    return fallbackSummary(data);
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

function renderReportHtml(data: ReportData, ai: AiSummary, title: string): string {
  const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
  const rows = data.impactRows
    .map(
      (r) => `<tr><td>${esc(r.name)}</td><td>${r.criticality}</td><td>${(r.impact * 100).toFixed(0)}%</td>` +
        `<td>${r.direct ? "direct" : r.via ? "via " + esc(r.via) : "—"}</td><td class="num">${money(r.revenueAtRisk)}</td></tr>`,
    )
    .join("");
  const events = data.events
    .slice(0, 12)
    .map((e) => `<li><b>${e.severity.toUpperCase()}</b> ${esc(e.title)}${e.source ? ` <span class="muted">— ${esc(e.source)}</span>` : ""}</li>`)
    .join("");
  const judgements = ai.keyJudgements.map((j) => `<li>${esc(j)}</li>`).join("");
  const recs = ai.recommendations.map((r) => `<li>${esc(r)}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#050505; color:#f3f4f6; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 40px 28px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 2px; color:#4ade80; margin: 28px 0 10px; }
  .brand { color:#4ade80; font-weight:700; letter-spacing:1px; }
  .muted { color:#9ca3af; }
  .kpi { display:flex; gap:24px; margin:16px 0; flex-wrap:wrap; }
  .kpi div { border:1px solid #222; border-radius:8px; padding:14px 18px; }
  .kpi b { display:block; font-size:22px; color:#4ade80; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid #222; }
  th { color:#9ca3af; font-weight:500; font-size:12px; text-transform:uppercase; }
  td.num, th.num { text-align:right; color:#f87171; }
  ul { line-height:1.7; padding-left:18px; } li { margin:2px 0; }
  .summary { background:#111; border:1px solid #222; border-radius:8px; padding:16px 18px; line-height:1.6; }
  footer { margin-top:36px; color:#6b7280; font-size:12px; border-top:1px solid #222; padding-top:12px; }
  @media print { body { background:#fff; color:#111; } .summary,.kpi div { border-color:#ccc; } }
</style></head><body><div class="wrap">
  <div class="brand">SentinelIQ™</div>
  <h1>${esc(title)}</h1>
  <div class="muted">${esc(data.orgName)} · ${fmt(data.periodStart)} → ${fmt(data.periodEnd)}</div>
  <div class="kpi">
    <div><span class="muted">Revenue at risk</span><b>${money(data.totalRevenueAtRisk)}</b></div>
    <div><span class="muted">Alert events</span><b>${data.events.length}</b></div>
    <div><span class="muted">Assets affected</span><b>${data.impactRows.length}</b></div>
  </div>
  <h2>Executive Summary</h2>
  <div class="summary">${esc(ai.executiveSummary)}</div>
  <h2>Key Judgements</h2><ul>${judgements || "<li class='muted'>None</li>"}</ul>
  <h2>Business Impact</h2>
  <table><thead><tr><th>Asset</th><th>Tier</th><th>Impact</th><th>Path</th><th class="num">At risk</th></tr></thead>
  <tbody>${rows || "<tr><td colspan='5' class='muted'>No impacted assets</td></tr>"}</tbody></table>
  <h2>Notable Events</h2><ul>${events || "<li class='muted'>No events in period</li>"}</ul>
  <h2>Recommendations</h2><ul>${recs || "<li class='muted'>None</li>"}</ul>
  <footer>Generated by SentinelIQ · ${fmt(Date.now())} · Print to save as PDF.</footer>
</div></body></html>`;
}

async function buildAndSave(
  ctx: { runQuery: any; runMutation: any },
  orgId: Id<"organizations">,
  sinceMs: number,
  source: "manual" | "scheduled",
  generatedByUserId?: Id<"users">,
): Promise<{ reportId: Id<"reports">; title: string; html: string }> {
  const data: ReportData = await ctx.runQuery(internal.reports.gatherReportData, { orgId, sinceMs });
  const ai = await generateSummary(data);
  const title = `Executive Risk Brief — ${new Date(data.periodEnd).toISOString().slice(0, 10)}`;
  const html = renderReportHtml(data, ai, title);
  const reportId: Id<"reports"> = await ctx.runMutation(internal.reports.saveReport, {
    orgId,
    generatedByUserId,
    title,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    summary: ai.executiveSummary,
    keyJudgements: ai.keyJudgements,
    recommendations: ai.recommendations,
    totalRevenueAtRisk: data.totalRevenueAtRisk,
    eventCount: data.events.length,
    html,
    source,
  });
  return { reportId, title, html };
}

/** Generate an executive brief on demand (viewer+). */
export const generate = action({
  args: { orgId: v.id("organizations"), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const access: { userId: Id<"users"> } = await ctx.runQuery(internal.reports.assertMember, { orgId: args.orgId });
    const sinceMs = Math.max(1, args.days ?? 7) * 24 * 60 * 60 * 1000;
    return await buildAndSave(ctx, args.orgId, sinceMs, "manual", access.userId);
  },
});

/** Weekly scheduled brief for every active org (called by the cron). */
export const scheduledReports = internalAction({
  args: {},
  handler: async (ctx) => {
    const orgIds: Id<"organizations">[] = await ctx.runQuery(internal.reports.activeOrgIds, {});
    let generated = 0;
    for (const orgId of orgIds) {
      await buildAndSave(ctx, orgId, WEEK_MS, "scheduled");
      generated++;
    }
    return { generated };
  },
});
