import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreEntity } from "../convex/lib/entity-score.ts";

const DAY = 24 * 60 * 60 * 1000;
const now = 1_000 * DAY;

test("score scales with recent severity-weighted volume", () => {
  const r = scoreEntity([{ severity: "critical", createdAt: now - DAY }], now, 7 * DAY);
  assert.equal(r.recentCount, 1);
  assert.equal(r.score, 84); // 7 * 12
});

test("score caps at 100", () => {
  const events = Array.from({ length: 5 }, () => ({ severity: "critical" as const, createdAt: now - DAY }));
  assert.equal(scoreEntity(events, now, 7 * DAY).score, 100);
});

test("trend up when recent exceeds prior", () => {
  const r = scoreEntity(
    [
      { severity: "high", createdAt: now - DAY },
      { severity: "high", createdAt: now - 2 * DAY },
      { severity: "low", createdAt: now - 10 * DAY },
    ],
    now,
    7 * DAY,
  );
  assert.equal(r.trend, "up");
  assert.equal(r.recentCount, 2);
  assert.equal(r.priorCount, 1);
});

test("trend down when recent below prior", () => {
  const r = scoreEntity(
    [
      { severity: "low", createdAt: now - DAY },
      { severity: "critical", createdAt: now - 9 * DAY },
      { severity: "critical", createdAt: now - 10 * DAY },
    ],
    now,
    7 * DAY,
  );
  assert.equal(r.trend, "down");
});

test("no events yields zero score and flat trend", () => {
  const r = scoreEntity([], now, 7 * DAY);
  assert.deepEqual(r, { score: 0, trend: "flat", recentCount: 0, priorCount: 0 });
});
