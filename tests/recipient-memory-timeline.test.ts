import test from "node:test";
import assert from "node:assert/strict";
import { buildRecipientMemoryTimeline } from "../src/core/recipient-memory-timeline.ts";

const addressA = "0x" + "a".repeat(64);
const addressB = "0x" + "b".repeat(64);
function memory(blobId: string, address: string, confirmedAt: string, counterpartyId = "supplier") {
  return { blobId, record: {
    chain: "sui" as const, network: "mainnet" as const, counterpartyId, address,
    confirmation: { method: "independent_contact" as const, confirmedAt, reference: "Confirmed out of band" },
  } };
}
test("empty memory timeline never authorizes payment", () => {
  const result = buildRecipientMemoryTimeline("supplier", []);
  assert.equal(result.status, "no_memories");
  assert.equal(result.paymentAuthorized, false);
  assert.equal(result.latestClaim, null);
});
test("one recalled claim remains informational", () => {
  const result = buildRecipientMemoryTimeline("supplier", [memory("a", addressA, "2026-10-20T10:00:00.000Z")]);
  assert.equal(result.status, "single_claim");
  assert.equal(result.distinctAddresses.length, 1);
  assert.equal(result.independentlyVerified, false);
});
test("two confirmations for the same address do not indicate a change", () => {
  const result = buildRecipientMemoryTimeline("supplier", [
    memory("a", addressA, "2026-10-20T10:00:00.000Z"),
    memory("b", addressA, "2026-10-21T10:00:00.000Z"),
  ]);
  assert.equal(result.status, "multiple_claims_same_address");
  assert.equal(result.entries.length, 2);
});
test("changed address is flagged even if the latest claim has a newer timestamp", () => {
  const result = buildRecipientMemoryTimeline("supplier", [
    memory("old", addressA, "2026-10-20T10:00:00.000Z"),
    memory("new", addressB, "2026-10-21T10:00:00.000Z"),
  ]);
  assert.equal(result.status, "address_change_requires_review");
  assert.equal(result.latestClaim?.address, addressB);
  assert.equal(result.paymentAuthorized, false);
});
test("duplicate blob and unrelated counterparty are excluded", () => {
  const a = memory("same", addressA, "2026-10-20T10:00:00.000Z");
  const result = buildRecipientMemoryTimeline("supplier", [
    a, a, memory("other", addressB, "2026-10-21T10:00:00.000Z", "different"),
  ]);
  assert.equal(result.entries.length, 1);
  assert.equal(result.status, "single_claim");
});
test("invalid or future-dated records are excluded", () => {
  const result = buildRecipientMemoryTimeline("supplier", [
    memory("future", addressA, "2999-01-01T00:00:00.000Z"),
    memory("bad", "not-an-address", "2026-10-20T10:00:00.000Z"),
  ]);
  assert.equal(result.status, "no_memories");
});
