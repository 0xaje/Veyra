import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAndIndexRecord,
  RecipientEvidenceIndex,
  computePayloadSha256,
} from "../src/core/recipient-evidence-index.ts";
import {
  buildPublicationConsentMessage,
  prepareConsentedRecipientConfirmation,
  verifyPublicationConsent,
} from "../src/core/self-service-confirmation.ts";
import {
  StorageSafeguardsLedger,
} from "../src/core/storage-safeguards.ts";

test("M2 Index: indexes and discovers records by blob, counterparty, and address with SHA-256 verification", () => {
  const index = new RecipientEvidenceIndex();

  const friendPayload = JSON.stringify({
    type: "veyra.recipient_evidence.v1",
    chain: "sui",
    network: "mainnet",
    counterpartyId: "friend-1-sui-recipient",
    address: "0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7f",
    addressKind: "wallet",
    recipientEligible: true,
    eventType: "recipient_reconfirmed",
    source: {
      kind: "direct_owner_confirmation",
      reference: "Friend verified directly",
      observedAt: "2026-10-23T22:33:54.962Z",
    },
    trust: "informational_unverified",
    independentlyVerified: false,
    paymentAuthorized: false,
  });

  const entry = index.addRecord("blob-12345", friendPayload);

  assert.equal(entry.blobId, "blob-12345");
  assert.equal(entry.payloadSha256, computePayloadSha256(friendPayload));
  assert.equal(entry.addressKind, "wallet");

  // Exact blob lookup
  const byBlob = index.getByBlobId("blob-12345");
  assert.ok(byBlob);
  assert.equal(byBlob.counterpartyId, "friend-1-sui-recipient");

  // Discovery by counterparty
  const byCp = index.getByCounterparty("friend-1-sui-recipient");
  assert.equal(byCp.length, 1);
  assert.equal(byCp[0].blobId, "blob-12345");

  // Discovery by address
  const byAddr = index.getByAddress("0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7f");
  assert.equal(byAddr.length, 1);

  // Rejects invalid payload
  assert.throws(() => {
    index.addRecord("blob-bad", "{ not valid json");
  });
});

test("M3 Consent: prepares cryptographically bound candidate record and message", () => {
  const { candidate, recordHash, candidateJson } = prepareConsentedRecipientConfirmation({
    address: "0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7f",
    counterpartyId: "friend-supplier",
    observedAt: "2026-10-24T10:00:00.000Z",
  });

  assert.equal(candidate.addressKind, "wallet");
  assert.equal(candidate.trust, "informational_unverified");
  assert.equal(candidate.independentlyVerified, false);
  assert.equal(candidate.paymentAuthorized, false);
  assert.equal(computePayloadSha256(candidateJson), recordHash);

  const consentMsg = buildPublicationConsentMessage({
    address: candidate.address,
    counterpartyId: candidate.counterpartyId,
    recordHash,
    scope: "public_walrus_recipient_confirmation",
    network: "sui-mainnet",
    expiresAt: "2026-10-24T10:15:00.000Z",
    nonce: "a".repeat(32),
  });

  assert.ok(consentMsg.includes("Veyra public recipient-confirmation publication consent"));
  assert.ok(consentMsg.includes(recordHash));
  assert.ok(consentMsg.includes(candidate.address));
});

test("M3 Safeguards: enforces idempotency and per-wallet rate limits", () => {
  const ledger = new StorageSafeguardsLedger({
    maxDailyWritesPerWallet: 2,
    maxGlobalDailyWrites: 10,
  });

  const wallet = "0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7f";

  // Check 1: Allowed
  const adm1 = ledger.checkAdmission(wallet, "idemp-1", "hash-aaa");
  assert.equal(adm1.allowed, true);
  assert.equal(adm1.existingReceipt, undefined);

  // Record 1st write
  ledger.recordSuccess("idemp-1", {
    schema: "veyra.storage_receipt.v1",
    receiptId: "rcpt-1",
    jobId: "job-1",
    blobId: "blob-1",
    address: wallet,
    counterpartyId: "supplier-1",
    recordHash: "hash-aaa",
    storedAt: new Date().toISOString(),
    status: "completed",
    paymentAuthorized: false,
  });

  // Idempotent retry returns existing receipt
  const retry = ledger.checkAdmission(wallet, "idemp-1", "hash-aaa");
  assert.equal(retry.allowed, true);
  assert.equal(retry.existingReceipt?.blobId, "blob-1");

  // Check 2: Allowed (2nd write of 2)
  const adm2 = ledger.checkAdmission(wallet, "idemp-2", "hash-bbb");
  assert.equal(adm2.allowed, true);

  ledger.recordSuccess("idemp-2", {
    schema: "veyra.storage_receipt.v1",
    receiptId: "rcpt-2",
    jobId: "job-2",
    blobId: "blob-2",
    address: wallet,
    counterpartyId: "supplier-2",
    recordHash: "hash-bbb",
    storedAt: new Date().toISOString(),
    status: "completed",
    paymentAuthorized: false,
  });

  // Check 3: Blocked by per-wallet quota
  const adm3 = ledger.checkAdmission(wallet, "idemp-3", "hash-ccc");
  assert.equal(adm3.allowed, false);
  assert.ok(adm3.reason?.includes("Daily limit"));
});
