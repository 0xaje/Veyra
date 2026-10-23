import test from "node:test";
import assert from "node:assert/strict";
import { prepareRecipientEvidenceEvent, type RecipientEvidenceEventInput } from "../src/core/recipient-evidence-event.ts";

const valid: RecipientEvidenceEventInput = {
  counterpartyId: "public-organization",
  address: "0x1",
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
