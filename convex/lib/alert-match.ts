// Pure matching logic for the alerts evaluation engine. No Convex imports so it
// stays trivially testable and reusable.

export type Severity = "low" | "medium" | "high" | "critical";

const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function severityAtLeast(severity: Severity, minimum: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum];
}

/** A candidate signal fed into the engine (e.g. a scored news item). */
export interface Signal {
  severity: Severity;
  title: string;
  url?: string;
  source?: string;
  countries?: string[]; // ISO codes
  companies?: string[]; // tickers / names
  topics?: string[]; // keywords
}

export interface WatchlistItem {
  type: "company" | "country" | "topic";
  value: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Which watchlist item values a signal matches. When `items` is empty the alert
 * has no scope filter, so severity alone decides (returns an empty match list,
 * still a hit). Matching is case-insensitive.
 */
export function matchedValues(signal: Signal, items: WatchlistItem[]): string[] {
  if (items.length === 0) return [];
  const haystack = new Set<string>([
    ...(signal.countries ?? []).map(norm),
    ...(signal.companies ?? []).map(norm),
    ...(signal.topics ?? []).map(norm),
  ]);
  const title = norm(signal.title);
  const matched: string[] = [];
  for (const item of items) {
    const v = norm(item.value);
    if (haystack.has(v) || (item.type === "topic" && title.includes(v))) {
      matched.push(item.value);
    }
  }
  return matched;
}

/**
 * True when a signal fires an alert: severity meets the threshold AND (the alert
 * has no scope, or the signal matches at least one scope item).
 */
export function signalFiresAlert(
  signal: Signal,
  minSeverity: Severity,
  items: WatchlistItem[],
): { fires: boolean; matched: string[] } {
  if (!severityAtLeast(signal.severity, minSeverity)) {
    return { fires: false, matched: [] };
  }
  if (items.length === 0) return { fires: true, matched: [] };
  const matched = matchedValues(signal, items);
  return { fires: matched.length > 0, matched };
}
