import test from "node:test";
import assert from "node:assert/strict";
import { preflightWithEvidence } from "../src/core/evidence-preflight.ts";

const proposedAddress = "0x" + "a".repeat(64);
const txDigest = "Dz3N8VQctUUCieG6naybTASbqmZ7B4kmze8M2E3p2Zfp";
const observation = {
  status: "observed" as const, provider: "tatum" as const,
  network: "sui-mainnet" as const, transport: "grpc" as const,
  method: "LedgerService/GetTransaction" as const,
  checkedAt: "2026-10-22T11:58:09.296Z",
  evidence: {
    digest: txDigest, sender: proposedAddress, executionStatus: "success",
    balanceChanges: [{ address: proposedAddress, amount: "135060", coinType: "0x2::sui::SUI" }],
  },
};
test("live-format Tatum evidence cannot authorize a payment without memory", () => {
  const result = preflightWithEvidence({
    counterpartyId: "vendor", proposedAddress, recalled: [], authorizations: [],
    tatumObservation: observation,
  });
  assert.equal(result.recipient.verdict, "review_required");
  assert.equal(result.historicalAddressObserved, true);
  assert.equal(result.chainEvidence.evidence[0].verified, false);
  assert.equal(result.paymentAuthorized, false);
  assert.equal(result.action, "manual_review_required");
});
test("unrelated historical transaction cannot establish a recipient", () => {
  const result = preflightWithEvidence({
    counterpartyId: "vendor", proposedAddress, recalled: [], authorizations: [],
    tatumObservation: { ...observation, evidence: {
      ...observation.evidence, sender: "0x" + "b".repeat(64), balanceChanges: [],
    } },
  });
  assert.equal(result.historicalAddressObserved, false);
  assert.equal(result.paymentAuthorized, false);
});
test("malformed provider address is treated as absent, not trusted", () => {
  const result = preflightWithEvidence({
    counterpartyId: "vendor", proposedAddress, recalled: [], authorizations: [],
    tatumObservation: { ...observation, evidence: {
      ...observation.evidence, sender: "invalid", balanceChanges: [{ address: "invalid", amount: "1", coinType: null }],
    } },
  });
  assert.equal(result.historicalAddressObserved, false);
});
test("no provider evidence remains insufficient", () => {
  const result = preflightWithEvidence({
    counterpartyId: "vendor", proposedAddress, recalled: [], authorizations: [],
  });
  assert.equal(result.chainEvidence.verdict, "insufficient_evidence");
  assert.equal(result.paymentAuthorized, false);
});

const rememberedAddress = "0x" + "b".repeat(64);
const memory = (address: string, counterpartyId = "vendor") => ({
  blobId: "walrus-test-blob",
  record: {
    chain: "sui" as const, network: "mainnet" as const,
    counterpartyId, address,
    confirmation: {
      method: "self_wallet_check" as const,
      confirmedAt: "2026-10-22T16:00:00.000Z",
      reference: "Test-only self wallet claim; no ownership established",
    },
  },
});
test("matching recalled claim is informational and never authorizes payment", () => {
  const result = preflightWithEvidence({
    counterpartyId: "vendor", proposedAddress,
    recalled: [memory(proposedAddress)], authorizations: [],
  });
  assert.equal(result.memoryComparison.status, "matches_remembered_claim");
  assert.equal(result.memoryComparison.independentlyVerified, false);
  assert.equal(result.memoryComparison.paymentAuthorized, false);
  assert.equal(result.paymentAuthorized, false);
  assert.equal(result.action, "manual_review_required");
});
test("one-character address change is explicitly marked different", () => {
  const result = preflightWithEvidence({
    counterpartyId: "vendor", proposedAddress,
    recalled: [memory("0x" + "a".repeat(63) + "b")], authorizations: [],
  });
  assert.equal(result.memoryComparison.status, "differs_from_remembered_claim");
  assert.equal(result.paymentAuthorized, false);
  assert.equal(result.recipient.verdict, "review_required");
});
test("unrelated counterparty memory does not imply an address match", () => {
  const result = preflightWithEvidence({
    counterpartyId: "vendor", proposedAddress,
    recalled: [memory(proposedAddress, "other-vendor")], authorizations: [],
  });
  assert.equal(result.memoryComparison.status, "not_found");
  assert.equal(result.paymentAuthorized, false);
});
test("two different recalled addresses are conflicting, not trusted", () => {
  const result = preflightWithEvidence({
    counterpartyId: "vendor", proposedAddress,
    recalled: [memory(proposedAddress), memory(rememberedAddress)], authorizations: [],
  });
  assert.equal(result.memoryComparison.status, "conflicting_memories");
  assert.equal(result.memoryComparison.rememberedAddresses.length, 2);
  assert.equal(result.paymentAuthorized, false);
});
test("duplicate memories of same address do not create a false conflict", () => {
  const result = preflightWithEvidence({
    counterpartyId: "vendor", proposedAddress,
    recalled: [memory(proposedAddress), memory(proposedAddress)], authorizations: [],
  });
  assert.equal(result.memoryComparison.status, "matches_remembered_claim");
  assert.equal(result.memoryComparison.rememberedAddresses.length, 1);
  assert.equal(result.paymentAuthorized, false);
});

test("integrated preflight exposes memory timeline without trusting a newer changed address", () => {
  const older = memory(proposedAddress);
  const newer = {
    ...memory(rememberedAddress),
    blobId: "walrus-new-blob",
    record: {
      ...memory(rememberedAddress).record,
      confirmation: {
        ...memory(rememberedAddress).record.confirmation,
        confirmedAt: "2026-10-22T17:00:00.000Z",
      },
    },
  };
  const result = preflightWithEvidence({
    counterpartyId: "vendor", proposedAddress,
    recalled: [older, newer], authorizations: [],
  });
  assert.equal(result.memoryTimeline.status, "address_change_requires_review");
  assert.equal(result.memoryTimeline.entries.length, 2);
  assert.equal(result.memoryTimeline.latestClaim?.address, rememberedAddress);
  assert.equal(result.recipient.verdict, "review_required");
  assert.equal(result.paymentAuthorized, false);
});
