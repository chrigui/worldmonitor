import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyEvent, computeRiskIndex } from "../convex/lib/risk-index.ts";

const DAY = 24 * 60 * 60 * 1000;
const now = 1_000 * DAY;

test("classifyEvent maps keywords to factors", () => {
  assert.deepEqual(classifyEvent("New sanctions on exports", []), ["political"]);
  assert.deepEqual(classifyEvent("Ransomware breach at vendor", []), ["cyber"]);
  assert.deepEqual(classifyEvent("Port congestion disrupts shipping", []), ["supplyChain"]);
});

test("classifyEvent buckets unmatched under security", () => {
  assert.deepEqual(classifyEvent("Something happened", []), ["security"]);
});

test("classifyEvent can return multiple factors", () => {
  const f = classifyEvent("Cyber attack causes port outage", []);
  assert.ok(f.includes("cyber"));
  assert.ok(f.includes("supplyChain"));
});

test("computeRiskIndex scores factors and overall", () => {
  const r = computeRiskIndex(
    [
      { severity: "critical", createdAt: now - DAY, title: "sanctions imposed", matched: [] },
      { severity: "high", createdAt: now - DAY, title: "port shutdown", matched: [] },
    ],
    now,
    7 * DAY,
  );
  assert.equal(r.factors.political, 70); // 7 * 10
  assert.equal(r.factors.supplyChain, 40); // 4 * 10
  assert.equal(r.contributingCount, 2);
  assert.ok(r.overall > 0 && r.overall <= 100);
  assert.ok(r.confidence > 0.3);
});

test("events outside the window are excluded", () => {
  const r = computeRiskIndex([{ severity: "critical", createdAt: now - 30 * DAY, title: "sanctions", matched: [] }], now, 7 * DAY);
  assert.equal(r.contributingCount, 0);
  assert.equal(r.overall, 0);
});
