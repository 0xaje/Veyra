import test from "node:test";
import assert from "node:assert/strict";
import { prepareRecipientRegistration, type RecipientRegistrationInput } from "../src/core/recipient-registration.ts";
import { checkRecipient } from "../src/core/recipient-check.ts";

const input: RecipientRegistrationInput = {
  chain: "sui",
  network: "mainnet",
  counterpartyId: "example-counterparty",
  address: "0x1",
  confirmation: {
    method: "independent_contact",
    confirmedAt: "2026-10-21T12:00:00.000Z",
    reference: "example-confirmation-reference",
  },
  userApprovedStorage: true,
};
test("prepares an approved record without claiming it was stored", () => {
  const result = prepareRecipientRegistration(input);
  assert.equal(result.storage, "not_attempted");
  assert.equal(result.trust, "user_confirmed_claim");
  assert.equal(result.record.address, "0x" + "0".repeat(63) + "1");
});
test("requires explicit storage approval", () => {
  assert.throws(() => prepareRecipientRegistration({ ...input, userApprovedStorage: false }), /Explicit user approval/);
});
test("rejects missing confirmation reference", () => {
  assert.throws(() => prepareRecipientRegistration({
    ...input, confirmation: { ...input.confirmation, reference: " " },
  }), /confirmation reference/);
});
test("rejects future confirmation timestamps", () => {
  assert.throws(() => prepareRecipientRegistration({
    ...input, confirmation: { ...input.confirmation, confirmedAt: "2099-01-01T00:00:00.000Z" },
  }), /non-future/);
});
test("rejects invalid addresses", () => {
  assert.throws(() => prepareRecipientRegistration({ ...input, address: "not-an-address" }), /Invalid Sui address/);
});
test("prepared record integrates with exact-address comparison", () => {
  const record = prepareRecipientRegistration(input).record;
  assert.equal(checkRecipient({ counterpartyId: record.counterpartyId, proposedAddress: "0x1", trustedRecord: record }).verdict, "match_confirmed_record");
  assert.equal(checkRecipient({ counterpartyId: record.counterpartyId, proposedAddress: "0x2", trustedRecord: record }).verdict, "recipient_mismatch");
});
