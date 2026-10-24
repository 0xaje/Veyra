import test from "node:test";
import assert from "node:assert/strict";
import { unifyRecipientEvidence } from "../src/core/unified-recipient-evidence.ts";
import { fingerprintRecipient } from "../src/core/recipient-preflight.ts";
import { preflightWithEvidence } from "../src/core/evidence-preflight.ts";

const a = "0x" + "1".repeat(64);
const b = "0x" + "2".repeat(64);
const claim = { blobId: "claim-id", record: { chain: "sui" as const, network: "mainnet" as const, counterpartyId: "supplier", address: a, confirmation: { method: "independent_contact", confirmedAt: "2026-10-20T12:00:00.000Z", reference: "user-confirmed" } } };
const observation = { blobId: "observation-id", record: { type: "veyra.recipient_evidence.v1", trust: "informational_unverified", paymentAuthorized: false, chain: "sui", network: "mainnet", counterpartyId: "supplier", address: b, addressKind: "wallet", eventType: "recipient_reconfirmed", source: { kind: "direct_owner_confirmation", reference: "real confirmation reference", observedAt: "2026-10-21T12:00:00.000Z" } } };
const control = { blobId: "control-id", record: { type: "veyra.wallet_control_memory.v1", chain: "sui", network: "mainnet", address: b, verification: "valid_signature_for_purpose_bound_challenge", provenance: "locally_reverified_portable_signature", signedChallengeIssuedAt: "2026-10-23T20:02:27.050Z", signedChallengeExpiresAt: "2026-10-23T20:12:27.050Z" } };

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
  assert.equal(result.entries.filter(e => e.recipientBaseline).length, 0);
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
  assert.equal(result.memoryComparison.status, "matches_remembered_claim");
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

test("M1: missing or future source evidence never creates a recipient baseline", () => {
  for (const source of [undefined, { ...observation.record.source, reference: "" }, { ...observation.record.source, observedAt: "2999-01-01T00:00:00.000Z" }]) {
    const result = preflightWithEvidence({ counterpartyId: "supplier", proposedAddress: b, recalled: [], authorizations: [], evidenceEvents: [{...observation, record: {...observation.record, source}}] });
    assert.equal(result.conclusion.status, "no_evidence");
    assert.equal(result.memoryComparison.status, "not_found");
    assert.equal(result.paymentAuthorized, false);
  }
});

test("M1: expired signing claims remain historical and never prove current control or recipient intent", () => {
  const result = unifyRecipientEvidence({ counterpartyId: "supplier", proposedAddress: b, walletControlEvents: [control], now: Date.parse("2026-10-24T00:00:00.000Z") });
  assert.equal(result.status, "no_evidence");
  assert.equal(result.walletControlObserved, true);
  assert.equal(result.entries[0].freshness, "expired_claim");
  assert.equal(result.entries[0].controlProven, false);
  assert.equal(result.entries[0].recipientBaseline, false);
  assert.equal(result.entries[0].observedAt, control.record.signedChallengeIssuedAt);
});

test("M1: even unexpired recalled verification claims require independent signature verification", () => {
  const result = unifyRecipientEvidence({ counterpartyId: "supplier", proposedAddress: b, walletControlEvents: [control], now: Date.parse("2026-10-23T20:05:00.000Z") });
  assert.equal(result.entries[0].freshness, "unexpired_claim");
  assert.equal(result.entries[0].controlProven, false);
  assert.equal(result.identityVerified, false);
});

test("M1: package references remain visible context and cannot become receiving addresses", () => {
  const event = {...observation, record: {...observation.record, addressKind: "package", eventType: "source_observed", source: {...observation.record.source, kind: "public_official_document"}}};
  const result = preflightWithEvidence({ counterpartyId: "supplier", proposedAddress: b, recalled: [], authorizations: [], evidenceEvents: [event] });
  assert.equal(result.unifiedEvidence.entries[0].kind, "informational_observation");
  assert.equal(result.conclusion.evidenceCount, 0);
  assert.equal(result.memoryComparison.status, "not_found");
  assert.equal(result.paymentAuthorized, false);
});

test("M1: repeated unverified blob identifiers cannot conceal conflicting payload addresses", () => {
  const result = preflightWithEvidence({ counterpartyId: "supplier", proposedAddress: b, recalled: [], authorizations: [], evidenceEvents: [observation, {...observation, record: {...observation.record, address: a}}] });
  assert.equal(result.conclusion.status, "conflicting_observations");
  assert.equal(result.memoryComparison.status, "conflicting_memories");
  assert.equal(result.unifiedEvidence.entries.length, 2);
});

test("M1: matching observation retains original source, timestamp and blob without legacy authorization", () => {
  const result = preflightWithEvidence({ counterpartyId: "supplier", proposedAddress: b, recalled: [], authorizations: [], evidenceEvents: [observation] });
  assert.deepEqual(result.memoryComparison.evidenceBlobIds, [observation.blobId]);
  assert.deepEqual(result.memoryComparison.rememberedAddresses, [b]);
  assert.equal(result.unifiedEvidence.entries[0].sourceReference, observation.record.source.reference);
  assert.equal(result.unifiedEvidence.entries[0].observedAt, observation.record.source.observedAt);
  assert.equal(result.recipient.scope, "legacy_exact_record_authorization_only");
  assert.equal(result.recipient.verdict, "review_required");
});

test("M1: malformed legacy claims cannot crash preflight or appear in comparison and timeline", () => {
  const malformed = {...claim, record: {...claim.record, confirmation: {...claim.record.confirmation, reference: ""}}};
  const result = preflightWithEvidence({counterpartyId: "supplier", proposedAddress: a, recalled: [malformed], authorizations: []});
  assert.equal(result.memoryComparison.status, "not_found");
  assert.equal(result.memoryTimeline.entries.length, 0);
  assert.equal(result.recipient.memoryBlobId, null);
});


test("M1: exact legacy authorization cannot mask a conflict with a newer observation", () => {
  const result = preflightWithEvidence({counterpartyId: "supplier", proposedAddress: a, recalled: [claim], authorizations: [{blobId: claim.blobId, recordSha256: fingerprintRecipient(claim.record), authorizedAt: "2026-10-21T12:00:00.000Z"}], evidenceEvents: [observation]});
  assert.equal(result.conclusion.status, "conflicting_observations");
  assert.equal(result.memoryComparison.status, "conflicting_memories");
  assert.equal(result.recipient.verdict, "review_required");
  assert.equal(result.paymentAuthorized, false);
});
