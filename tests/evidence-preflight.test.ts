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
