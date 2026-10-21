import test from "node:test";
import assert from "node:assert/strict";
import { assess } from "../src/core/assessment.ts";
test("does not infer safety from no evidence", () => {
  const result = assess({ recipient: "0x123", chain: "sui", network: "mainnet", evidence: [] });
  assert.equal(result.verdict, "insufficient_evidence");
});
test("verified evidence never becomes a safety guarantee", () => {
  const result = assess({ recipient: "0x123", chain: "sui", network: "mainnet", evidence: [{source:"tatum",reference:"chain:tx",observedAt:"2026-10-21T00:00:00Z",verified:true}] });
  assert.equal(result.verdict, "review_required");
});
