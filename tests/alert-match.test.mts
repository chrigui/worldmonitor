import { test } from "node:test";
import assert from "node:assert/strict";
import {
  severityAtLeast,
  matchedValues,
  signalFiresAlert,
  type Signal,
  type WatchlistItem,
} from "../convex/lib/alert-match.ts";

test("severityAtLeast respects ordering", () => {
  assert.equal(severityAtLeast("critical", "high"), true);
  assert.equal(severityAtLeast("low", "medium"), false);
  assert.equal(severityAtLeast("high", "high"), true);
});

const items: WatchlistItem[] = [
  { type: "country", value: "RU" },
  { type: "company", value: "XOM" },
  { type: "topic", value: "sanctions" },
];

test("matchedValues matches countries/companies case-insensitively", () => {
  const signal: Signal = { severity: "high", title: "Update", countries: ["ru"], companies: ["AAPL"] };
  assert.deepEqual(matchedValues(signal, items), ["RU"]);
});

test("matchedValues matches topic keyword in the title", () => {
  const signal: Signal = { severity: "high", title: "New Sanctions imposed today" };
  assert.deepEqual(matchedValues(signal, items), ["sanctions"]);
});

test("signalFiresAlert requires severity threshold", () => {
  const signal: Signal = { severity: "low", title: "Sanctions", topics: ["sanctions"] };
  assert.deepEqual(signalFiresAlert(signal, "high", items), { fires: false, matched: [] });
});

test("signalFiresAlert with no scope fires on severity alone", () => {
  const signal: Signal = { severity: "critical", title: "Anything" };
  assert.deepEqual(signalFiresAlert(signal, "high", []), { fires: true, matched: [] });
});

test("signalFiresAlert requires a scope match when scoped", () => {
  const noMatch: Signal = { severity: "critical", title: "Unrelated", countries: ["FR"] };
  assert.equal(signalFiresAlert(noMatch, "low", items).fires, false);
  const match: Signal = { severity: "critical", title: "Unrelated", companies: ["xom"] };
  assert.deepEqual(signalFiresAlert(match, "low", items), { fires: true, matched: ["XOM"] });
});
