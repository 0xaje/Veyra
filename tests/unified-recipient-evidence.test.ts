import test from "node:test";
import assert from "node:assert/strict";
import { unifyRecipientEvidence } from "../src/core/unified-recipient-evidence.ts";
import { preflightWithEvidence } from "../src/core/evidence-preflight.ts";

const a = "0x" + "1".repeat(64);
const b = "0x" + "2".repeat(64);
const claim = { blobId: "claim-id", record: { chain: "sui" as const, network: "mainnet" as const, counterpartyId: "supplier", address: a, confirmation: { method: "independent_contact", confirmedAt: "2026-10-20T12:00:00.000Z", reference: "user-confirmed" } } };
const observation = { blobId: "observation-id", record: { type: "veyra.recipient_evidence.v1", chain: "sui", network: "mainnet", counterpartyId: "supplier", address: b, addressKind: "wallet", eventType: "recipient_reconfirmed", source: { kind: "direct_owner_confirmation", reference: "real confirmation reference", observedAt: "2026-10-21T12:00:00.000Z" } } };
const control = { blobId: "control-id", record: { type: "veyra.wallet_control_memory.v1", chain: "sui", network: "mainnet", address: b, verification: "valid_signature_for_purpose_bound_challenge", provenance: "locally_reverified_portable_signature", signedChallengeExpiresAt: "2026-10-23T20:12:27.050Z" } };

test("M1: unifies genuine record formats without turning claims into identity or authorization", () => {
  const result = unifyRecipientEvidence({ counterpartyId: "supplier", proposedAddress: b, recipientClaims: [claim], evidenceEvents: [observation], walletControlEvents: [control] });
  assert.equal(result.status, "conflicting_observations");
  assert.equal(result.entries.length, 3);
  assert.equal(result.walletControlObserved, true);
  assert.equal(result.identityVerified, false);
  assert.equal(result.paymentAuthorized, false);
  assert.equal(result.retrievalCompleteness, "unknown");
  assert.ok(result.entries.every(e => !e.recipientRelationshipProven));
});

test("M1: package, unrelated counterparty and unverified owner observations cannot create recipient baseline", () => {
  const result = unifyRecipientEvidence({ counterpartyId: "supplier", proposedAddress: a, evidenceEvents: [
    { blobId: "package", record: { ...observation.record, addressKind: "package" } },
    { blobId: "other", record: { ...observation.record, counterpartyId: "other" } },
    { blobId: "source", record: { ...observation.record, eventType: "source_observed" } },
  ] });
  assert.equal(result.status, "no_evidence");
  assert.equal(result.entries.length, 0);
});

test("M1: main preflight carries unified evidence but never authorizes payment", () => {
  const result = preflightWithEvidence({ counterpartyId: "supplier", proposedAddress: b, recalled: [claim], authorizations: [], evidenceEvents: [observation], walletControlEvents: [control] });
  assert.equal(result.unifiedEvidence.status, "conflicting_observations");
  assert.equal(result.paymentAuthorized, false);
  assert.equal(result.action, "manual_review_required");
});

test("M1: new-format observation produces one conservative preflight conclusion despite empty legacy records", () => {
  const result = preflightWithEvidence({ counterpartyId: "supplier", proposedAddress: b, recalled: [], authorizations: [], evidenceEvents: [observation] });
  assert.equal(result.conclusion.status, "matches_observed_address");
  assert.equal(result.conclusion.evidenceCount, 1);
  assert.equal(result.memoryComparison.status, "not_found");
  assert.equal(result.recipient.verdict, "review_required");
  assert.equal(result.conclusion.paymentAuthorized, false);
  assert.equal(result.action, "manual_review_required");
  assert.match(result.reasons[0], /not proof of identity/);
});
test("M1: changed address is highlighted in unified conclusion", () => {
  const result = preflightWithEvidence({ counterpartyId: "supplier", proposedAddress: a, recalled: [], authorizations: [], evidenceEvents: [observation] });
  assert.equal(result.conclusion.status, "differs_from_observed_address");
  assert.match(result.conclusion.message, /differs/);
  assert.equal(result.paymentAuthorized, false);
});
