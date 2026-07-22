import { test } from "node:test";
import assert from "node:assert/strict";
import { computeImpact, type AssetNode, type AssetEdge, type ImpactSignal } from "../convex/lib/impact.ts";

const assets: AssetNode[] = [
  { id: "sup", name: "TSMC", type: "supplier", criticality: "tier1", revenueAtRisk: 1000, entities: [{ type: "company", value: "TSM" }] },
  { id: "prod", name: "Product Line A", type: "product", criticality: "tier1", revenueAtRisk: 5000, entities: [] },
  { id: "unrelated", name: "EU Ops", type: "market", criticality: "tier2", revenueAtRisk: 800, entities: [{ type: "country", value: "FR" }] },
];
const edges: AssetEdge[] = [{ fromAssetId: "sup", toAssetId: "prod", weight: 0.8 }];

test("direct hit sets impact from severity weight", () => {
  const r = computeImpact(assets, edges, [{ severity: "high", title: "TSMC delay", companies: ["TSM"] }]);
  const sup = r.rows.find((x) => x.assetId === "sup")!;
  assert.equal(sup.direct, true);
  assert.equal(sup.impact, 0.75);
  assert.equal(sup.revenueAtRisk, 750);
});

test("impact propagates to dependents with decay", () => {
  const r = computeImpact(assets, edges, [{ severity: "critical", title: "TSMC halt", companies: ["TSM"] }]);
  const prod = r.rows.find((x) => x.assetId === "prod")!;
  assert.equal(prod.direct, false);
  assert.equal(prod.via, "TSMC"); // propagated from the supplier
  assert.equal(prod.impact, 0.8); // 1.0 * 0.8 edge weight
  assert.equal(prod.revenueAtRisk, 4000); // 5000 * 0.8
});

test("unrelated assets are excluded", () => {
  const r = computeImpact(assets, edges, [{ severity: "critical", title: "TSMC halt", companies: ["TSM"] }]);
  assert.equal(r.rows.some((x) => x.assetId === "unrelated"), false);
  assert.equal(r.directCount, 1);
});

test("no matching signal yields empty result", () => {
  const r = computeImpact(assets, edges, [{ severity: "low", title: "Something in Brazil", countries: ["BR"] } as ImpactSignal]);
  assert.equal(r.rows.length, 0);
  assert.equal(r.totalRevenueAtRisk, 0);
});
