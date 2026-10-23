import test from "node:test";
import assert from "node:assert/strict";
import { issueWalletChallenge, verifyWalletChallenge } from "../src/core/wallet-challenge.ts";

const ADDRESS = "0x83874235f1db9761bcce93a11466a613a4516085da5ccfe121dddc3d63a0b5e8";

test("issues purpose-bound, expiring, transaction-free challenges", () => {
  const challenge = issueWalletChallenge(ADDRESS);
  assert.equal(challenge.address, ADDRESS);
  assert.equal(challenge.paymentAuthorized, false);
  assert.match(challenge.message, /NOT a payment authorization/);
  assert.ok(challenge.message.includes(ADDRESS));
  assert.ok(challenge.message.includes(challenge.nonce));
  assert.equal(Date.parse(challenge.expiresAt) - Date.parse(challenge.issuedAt), 300000);
});

test("challenge is single-use even when verification fails", async () => {
  const challenge = issueWalletChallenge(ADDRESS);
  const input = { nonce: challenge.nonce, address: ADDRESS, signature: "not-a-real-signature" };
  const first = await verifyWalletChallenge(input);
  assert.notEqual(first.status, "wallet_control_verified");
  assert.equal(first.paymentAuthorized, false);
  const second = await verifyWalletChallenge(input);
  assert.equal(second.status, "invalid_or_consumed_challenge");
});

test("wrong address fails without granting control", async () => {
  const challenge = issueWalletChallenge(ADDRESS);
  const other = "0x" + "a".repeat(64);
  const result = await verifyWalletChallenge({ nonce: challenge.nonce, address: other, signature: "invalid" });
  assert.equal(result.status, "address_mismatch");
  assert.equal(result.paymentAuthorized, false);
});

test("expired challenge is rejected", async () => {
  const issued = Date.now();
  const challenge = issueWalletChallenge(ADDRESS, issued);
  const result = await verifyWalletChallenge({ nonce: challenge.nonce, address: ADDRESS, signature: "invalid" }, issued + 300001);
  assert.equal(result.status, "expired_challenge");
  assert.equal(result.paymentAuthorized, false);
});

test("malformed challenge cannot authorize payment", async () => {
  const result = await verifyWalletChallenge({ nonce: "no", address: ADDRESS, signature: "" });
  assert.equal(result.status, "invalid_challenge");
  assert.equal(result.paymentAuthorized, false);
});
