import test from "node:test";
import assert from "node:assert/strict";
import { prepareRecipientEvidenceEvent, type RecipientEvidenceEventInput } from "../src/core/recipient-evidence-event.ts";

const valid: RecipientEvidenceEventInput = {
  counterpartyId: "public-organization",
  address: "0x1",
  addressKind: "wallet",
  eventType: "source_observed",
  source: {
    kind: "public_official_document",
    reference: "https://example.org/official-address-reference",
    observedAt: "2026-10-22T12:00:00.000Z",
  },
  userApprovedStorage: true,
};
test("public source observations remain informational and cannot authorize payment", () => {
  const result = prepareRecipientEvidenceEvent(valid);
  assert.equal(result.type, "veyra.recipient_evidence.v1");
  assert.equal(result.trust, "informational_unverified");
  assert.equal(result.independentlyVerified, false);
  assert.equal(result.paymentAuthorized, false);
  assert.equal(result.address, "0x" + "0".repeat(63) + "1");
});
test("requires explicit approval", () => {
  assert.throws(() => prepareRecipientEvidenceEvent({ ...valid, userApprovedStorage: false }), /approval/);
});
test("rejects reconfirmation based on public attribution", () => {
  assert.throws(() => prepareRecipientEvidenceEvent({ ...valid, eventType: "recipient_reconfirmed" }), /direct owner/);
});
test("rejects mismatches not backed by an actual local assessment", () => {
  assert.throws(() => prepareRecipientEvidenceEvent({ ...valid, eventType: "mismatch_reviewed" }), /local assessment/);
});
test("rejects future-dated and invalid observations", () => {
  assert.throws(() => prepareRecipientEvidenceEvent({ ...valid, source: { ...valid.source, observedAt: "2099-01-01T00:00:00.000Z" } }), /timestamp/);
  assert.throws(() => prepareRecipientEvidenceEvent({ ...valid, address: "invalid" }), /Invalid Sui address/);
});

test("package observations are non-recipient identifiers", () => {
  const result = prepareRecipientEvidenceEvent({ ...valid, addressKind: "package" });
  assert.equal(result.addressKind, "package");
  assert.equal(result.recipientEligible, false);
  assert.match(result.warning, /not a payment recipient/);
  assert.equal(result.paymentAuthorized, false);
});
test("package and object identifiers cannot be confirmed as wallet recipients", () => {
  assert.throws(() => prepareRecipientEvidenceEvent({
    ...valid, addressKind: "package", eventType: "recipient_reconfirmed",
    source: { ...valid.source, kind: "direct_owner_confirmation" },
  }), /Only wallet/);
  assert.throws(() => prepareRecipientEvidenceEvent({
    ...valid, addressKind: "shared_object", eventType: "mismatch_reviewed",
    source: { ...valid.source, kind: "local_assessment" },
  }), /Only wallet/);
});
test("missing address kind is rejected", () => {
  const missing = { ...valid };
  delete (missing as Partial<RecipientEvidenceEventInput>).addressKind;
  assert.throws(() => prepareRecipientEvidenceEvent(missing), /address kind/);
});
