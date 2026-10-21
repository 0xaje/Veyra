import test from "node:test";
import assert from "node:assert/strict";
import { checkRecipient, normalizeSuiAddress, type RecipientRecord } from "../src/core/recipient-check.ts";
const addressA = "0x" + "a".repeat(64);
const addressB = "0x" + "a".repeat(6) + "b".repeat(52) + "a".repeat(6);
const record: RecipientRecord = {
  chain: "sui", network: "mainnet", counterpartyId: "supplier-1", address: addressA,
  confirmation: { method: "independent_contact", confirmedAt: "2026-10-21T12:00:00Z", reference: "user-confirmed-record-1" },
};
test("flags lookalike address even with identical prefix and suffix", () => {
  const result = checkRecipient({ proposedAddress: addressB, counterpartyId: "supplier-1", trustedRecord: record });
  assert.equal(result.verdict, "recipient_mismatch");
  assert.equal(result.trustedAddress, addressA);
});
test("matching address does not imply safety", () => {
  const result = checkRecipient({ proposedAddress: addressA.toUpperCase().replace("0X", "0x"), counterpartyId: "supplier-1", trustedRecord: record });
  assert.equal(result.verdict, "match_confirmed_record");
  assert.match(result.reasons[0], /does not establish/);
});
test("missing trusted record is not a match", () => {
  assert.equal(checkRecipient({ proposedAddress: addressA, counterpartyId: "supplier-1" }).verdict, "no_trusted_record");
});
test("rejects mismatched counterparty records", () => {
  assert.throws(() => checkRecipient({ proposedAddress: addressA, counterpartyId: "supplier-2", trustedRecord: record }), /does not match/);
});
test("normalizes valid Sui addresses and rejects invalid inputs", () => {
  assert.equal(normalizeSuiAddress("0x1"), "0x" + "0".repeat(63) + "1");
  assert.throws(() => normalizeSuiAddress("0xnot-hex"), /Invalid Sui/);
});
test("rejects unconfirmed record provenance", () => {
  assert.throws(() => checkRecipient({ proposedAddress: addressA, counterpartyId: "supplier-1", trustedRecord: { ...record, confirmation: { ...record.confirmation, reference: "" } } }), /documented confirmation/);
});
