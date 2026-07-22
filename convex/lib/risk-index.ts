// Pure multi-factor risk index. Classifies alert events into risk factors by
// keyword and aggregates a per-factor and overall 0..100 index with a
// data-driven confidence. No Convex imports so it stays testable.

import type { Severity } from "./alert-match";

export type RiskFactor =
  | "political"
  | "economic"
  | "security"
  | "supplyChain"
  | "cyber"
  | "disaster";

export const RISK_FACTORS: RiskFactor[] = [
  "political",
  "economic",
  "security",
  "supplyChain",
  "cyber",
  "disaster",
];

// Aggregation weights (sum to 1).
const FACTOR_WEIGHT: Record<RiskFactor, number> = {
  security: 0.2,
  political: 0.2,
  supplyChain: 0.2,
  economic: 0.15,
  cyber: 0.15,
  disaster: 0.1,
};

const SEVERITY_WEIGHT: Record<Severity, number> = { low: 1, medium: 2, high: 4, critical: 7 };

const KEYWORDS: Record<RiskFactor, string[]> = {
  political: ["sanction", "election", "coup", "protest", "unrest", "regime", "diplomat", "tariff", "border"],
  economic: ["inflation", "default", "currency", "recession", "debt", "gdp", "rate", "market crash", "devaluation"],
  security: ["conflict", "attack", "drone", "military", "strike", "missile", "war", "terror", "shooting", "escalat"],
  supplyChain: ["port", "supply", "logistics", "shipping", "freight", "shortage", "factory", "route", "transit", "chip"],
  cyber: ["breach", "ransomware", "cyber", "hack", "malware", "phishing", "ddos", "outage", "exploit"],
  disaster: ["earthquake", "flood", "wildfire", "storm", "hurricane", "volcano", "drought", "tsunami", "quake"],
};

/** Classify an event's text into zero or more risk factors. */
export function classifyEvent(title: string, matched: string[]): RiskFactor[] {
  const hay = (title + " " + matched.join(" ")).toLowerCase();
  const factors: RiskFactor[] = [];
  for (const f of RISK_FACTORS) {
    if (KEYWORDS[f].some((k) => hay.includes(k))) factors.push(f);
  }
  // Unclassified events still represent a threat — bucket under security.
  return factors.length ? factors : ["security"];
}

export interface RiskIndex {
  overall: number; // 0..100
  factors: Record<RiskFactor, number>; // each 0..100
  confidence: number; // 0..1
  contributingCount: number;
  byFactorCount: Record<RiskFactor, number>;
}

export interface RiskEvent {
  severity: Severity;
  createdAt: number;
  title: string;
  matched: string[];
}

/**
 * Compute the multi-factor risk index from events within `windowMs` of `now`.
 * Per factor: severity-weighted volume of classified events, scaled to 0..100.
 * Overall: weighted mean of the factor scores. Confidence grows with the number
 * of contributing events.
 */
export function computeRiskIndex(events: RiskEvent[], now: number, windowMs: number): RiskIndex {
  const factorWeightedSum: Record<RiskFactor, number> = {
    political: 0, economic: 0, security: 0, supplyChain: 0, cyber: 0, disaster: 0,
  };
  const byFactorCount: Record<RiskFactor, number> = {
    political: 0, economic: 0, security: 0, supplyChain: 0, cyber: 0, disaster: 0,
  };
  let contributingCount = 0;

  for (const e of events) {
    if (now - e.createdAt > windowMs) continue;
    contributingCount++;
    const w = SEVERITY_WEIGHT[e.severity];
    for (const f of classifyEvent(e.title, e.matched)) {
      factorWeightedSum[f] += w;
      byFactorCount[f] += 1;
    }
  }

  const factors = {} as Record<RiskFactor, number>;
  let overall = 0;
  for (const f of RISK_FACTORS) {
    const score = Math.min(100, Math.round(factorWeightedSum[f] * 10));
    factors[f] = score;
    overall += score * FACTOR_WEIGHT[f];
  }

  const confidence = Math.min(0.95, 0.3 + contributingCount * 0.05);
  return {
    overall: Math.round(overall),
    factors,
    confidence: Math.round(confidence * 100) / 100,
    contributingCount,
    byFactorCount,
  };
}
