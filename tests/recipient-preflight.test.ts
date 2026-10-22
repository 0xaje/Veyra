import test from "node:test";
import assert from "node:assert/strict";
import {
  fingerprintRecipient, preflightRememberedRecipient,
} from "../src/core/recipient-preflight.ts";
import type { RecipientRecord } from "../src/core/recipient-check.ts";

const address = "0x" + "a".repeat(64);
const lookalike = "0x" + "a".repeat(6) + "b".repeat(52) + "a".repeat(6);
const record: RecipientRecord = {
  chain: "sui", network: "mainnet", counterpartyId: "supplier-1", address,
  confirmation: {
    method: "independent_contact",
    confirmedAt: "2026-10-21T12:00:00.000Z",
    reference: "test-confirmation",
  },
};
const recalled = [{ blobId: "blob-1", record }];
const authorizations = [{
  blobId: "blob-1", recordSha256: fingerprintRecipient(record),
  authorizedAt: "2026-10-21T12:10:00.000Z",
}];
const input = { counterpartyId: "supplier-1", proposedAddress: address, recalled, authorizations };
test("unapproved Walrus memory requires review", () => {
  assert.equal(preflightRememberedRecipient({ ...input, authorizations: [] }).verdict, "review_required");
});
test("locally authorized exact record can match without safety guarantee", () => {
  const result = preflightRememberedRecipient(input);
  assert.equal(result.verdict, "match_authorized_record");
  assert.match(result.reasons[0], /does not establish/);
});
test("lookalike destination mismatches an authorized memory", () => {
  assert.equal(preflightRememberedRecipient({ ...input, proposedAddress: lookalike }).verdict, "recipient_mismatch");
});
test("tampered memory fails authorization", () => {
  const changed = [{ blobId: "blob-1", record: { ...record, address: "0x1" } }];
  assert.equal(preflightRememberedRecipient({ ...input, recalled: changed }).verdict, "review_required");
});
test("wrong blob ID fails authorization", () => {
  assert.equal(preflightRememberedRecipient({ ...input, recalled: [{ blobId: "blob-2", record }] }).verdict, "review_required");
});
test("conflicting memory candidates require review", () => {
  assert.equal(preflightRememberedRecipient({ ...input, recalled: [...recalled, { blobId: "blob-2", record }] }).verdict, "review_required");
});
test("missing memory requires review", () => {
  assert.equal(preflightRememberedRecipient({ ...input, recalled: [] }).verdict, "review_required");
});
