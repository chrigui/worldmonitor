// Pure business-impact propagation over an asset dependency graph. No Convex
// imports so it stays testable and reusable.

import type { Severity } from "./alert-match";

const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1,
};

export interface ImpactSignal {
  severity: Severity;
  title: string;
  countries?: string[];
  companies?: string[];
  topics?: string[];
}

export interface AssetNode {
  id: string;
  name: string;
  type: string;
  criticality: "tier1" | "tier2" | "tier3";
  revenueAtRisk?: number;
  entities: { type: "company" | "country" | "topic"; value: string }[];
}

export interface AssetEdge {
  fromAssetId: string;
  toAssetId: string;
  weight: number;
}

export interface ImpactRow {
  assetId: string;
  name: string;
  type: string;
  criticality: "tier1" | "tier2" | "tier3";
  impact: number; // 0..1
  direct: boolean;
  via: string | null; // name of the upstream asset it propagated from
  revenueAtRisk: number; // contribution = asset.revenueAtRisk * impact
  confidence: number; // 0..1
}

export interface ImpactResult {
  rows: ImpactRow[];
  totalRevenueAtRisk: number;
  directCount: number;
  affectedCount: number;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** True (and how strongly) a signal directly hits an asset via its entities. */
function directHit(signal: ImpactSignal, asset: AssetNode): boolean {
  if (asset.entities.length === 0) return false;
  const hay = new Set<string>([
    ...(signal.countries ?? []).map(norm),
    ...(signal.companies ?? []).map(norm),
    ...(signal.topics ?? []).map(norm),
  ]);
  const title = norm(signal.title);
  return asset.entities.some((e) => {
    const v = norm(e.value);
    return hay.has(v) || (e.type === "topic" && title.includes(v));
  });
}

/**
 * Compute per-asset business impact from a batch of signals, propagating along
 * dependency edges with decay. Direct impact = the strongest matching signal's
 * severity weight. Propagated impact = max over incoming edges of
 * upstream_impact * edge_weight. Relaxed to a fixed point (cycle-safe: impact is
 * monotonic and bounded by 1).
 */
export function computeImpact(
  assets: AssetNode[],
  edges: AssetEdge[],
  signals: ImpactSignal[],
): ImpactResult {
  const impact = new Map<string, number>();
  const direct = new Map<string, boolean>();
  const via = new Map<string, string | null>();
  const byId = new Map(assets.map((a) => [a.id, a]));

  for (const a of assets) {
    let d = 0;
    for (const s of signals) {
      if (directHit(s, a)) d = Math.max(d, SEVERITY_WEIGHT[s.severity]);
    }
    impact.set(a.id, d);
    direct.set(a.id, d > 0);
    via.set(a.id, null);
  }

  // Relax edges until stable (at most assets.length passes).
  const passes = Math.max(1, Math.min(assets.length, 8));
  for (let p = 0; p < passes; p++) {
    let changed = false;
    for (const e of edges) {
      const from = impact.get(e.fromAssetId);
      if (from === undefined || from === 0) continue;
      const candidate = from * Math.max(0, Math.min(1, e.weight));
      const cur = impact.get(e.toAssetId) ?? 0;
      if (candidate > cur + 1e-9) {
        impact.set(e.toAssetId, candidate);
        if (!direct.get(e.toAssetId)) via.set(e.toAssetId, byId.get(e.fromAssetId)?.name ?? null);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const rows: ImpactRow[] = [];
  let totalRevenueAtRisk = 0;
  let directCount = 0;
  for (const a of assets) {
    const imp = impact.get(a.id) ?? 0;
    if (imp <= 0) continue;
    const isDirect = direct.get(a.id) ?? false;
    const rev = Math.round((a.revenueAtRisk ?? 0) * imp);
    totalRevenueAtRisk += rev;
    if (isDirect) directCount++;
    rows.push({
      assetId: a.id,
      name: a.name,
      type: a.type,
      criticality: a.criticality,
      impact: imp,
      direct: isDirect,
      via: via.get(a.id) ?? null,
      revenueAtRisk: rev,
      confidence: isDirect ? 0.85 : Math.max(0.3, 0.6 * imp),
    });
  }
  rows.sort((x, y) => y.impact - x.impact || y.revenueAtRisk - x.revenueAtRisk);
  return { rows, totalRevenueAtRisk, directCount, affectedCount: rows.length };
}
