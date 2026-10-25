import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Script, runInNewContext } from "node:vm";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { PreparedPublications } from "../src/core/prepared-publication.ts";
import { buildPublicationConsentMessage, verifyPublicationConsent } from "../src/core/self-service-confirmation.ts";
import { preflightWithEvidence } from "../src/core/evidence-preflight.ts";
import { acceptedMemoryJob, completedMemoryJob } from "../src/core/memory-write-state.ts";
import type { MemWal } from "@mysten-incubation/memwal";

// Local cryptographic and record fixtures. These tests do not write or claim
// Mainnet storage; live acceptance remains a separate contract gate.
test("M3: delayed real signature verifies against the exact prepared storage bytes", async () => {
  const key = Ed25519Keypair.generate();
  const now = Date.now();
  const stage = new PreparedPublications();
  const first = stage.issue(key.toSuiAddress(), "local-test-recipient", now);
  assert.equal(createHash("sha256").update(first.candidateJson).digest("hex"), first.recordHash);
  assert.deepEqual(JSON.parse(first.candidateJson), first.candidate);
  const signed = await key.signPersonalMessage(new TextEncoder().encode(first.consentMessage));
  const verified = await verifyPublicationConsent(first.consentPayload, signed.signature, now + 30_000);
  assert.equal(verified.status, "valid");
  const submitted = stage.consume(first.consentPayload, now + 30_000);
  assert.equal(submitted?.candidateJson, first.candidateJson);
  assert.equal(submitted?.recordHash, first.recordHash);
  assert.equal(stage.consume(first.consentPayload, now + 30_000), null);
  assert.equal(first.candidate.independentlyVerified, false);
  assert.equal(first.candidate.paymentAuthorized, false);
  assert.ok(!first.candidateJson.includes(signed.signature));
});

test("M3: altered consent, foreign preparation, expiry and caller mutation fail closed", () => {
  const now = Date.now() - 600_001;
  const stage = new PreparedPublications(1);
  const first = stage.issue("0x1", "local-test-recipient", now);
  for (const change of [
    { address: "0x2" }, { counterpartyId: "other" }, { recordHash: "b".repeat(64) },
    { scope: "other" }, { network: "testnet" }, { expiresAt: new Date(now + 1).toISOString() },
    { nonce: "b".repeat(32) },
  ]) assert.equal(stage.get({ ...first.consentPayload, ...change } as typeof first.consentPayload, now), null);
  first.candidate.source.observedAt = "2999-01-01T00:00:00.000Z";
  assert.notEqual(stage.get(first.consentPayload, now)?.candidate.source.observedAt, first.candidate.source.observedAt);
  assert.throws(() => stage.issue("0x2", "other", now), /outstanding/);
  assert.equal(new PreparedPublications().get(first.consentPayload, now), null);
  assert.equal(stage.get(first.consentPayload, now + 600_000), null);
  assert.doesNotThrow(() => stage.issue("0x2", "other", now + 600_000));
});

test("M3: runtime consent validation rejects malformed or changed signing domains", async () => {
  const stage = new PreparedPublications();
  const first = stage.issue("0x1", "local-test-recipient");
  for (const change of [{ network: "sui-testnet" }, { scope: "payment" }, { counterpartyId: "name\nInjected: text" }, { recordHash: "bad" }, { nonce: "" }]) {
    const input = { ...first.consentPayload, ...change } as typeof first.consentPayload;
    assert.throws(() => buildPublicationConsentMessage(input));
    assert.equal((await verifyPublicationConsent(input, "invalid-test-signature")).status, "mismatch");
  }
});

test("M1/M4: a prepared recipient record is understood by comparison AND timeline", () => {
  const prepared = new PreparedPublications().issue("0x1", "local-test-recipient");
  const input = {
    counterpartyId: prepared.candidate.counterpartyId, proposedAddress: prepared.candidate.address,
    recalled: [], authorizations: [], evidenceEvents: [{ blobId: "local-fixture-only", record: prepared.candidate }],
  };
  const result = preflightWithEvidence(input);
  assert.equal(result.conclusion.status, "matches_observed_address");
  assert.equal(result.memoryComparison.status, "matches_remembered_claim");
  assert.equal(result.memoryTimeline.status, "single_claim");
  assert.equal(result.memoryTimeline.entries[0].blobId, "local-fixture-only");
  assert.equal(result.memoryTimeline.entries[0].confirmedAt, prepared.candidate.source.observedAt);
  assert.equal(result.unifiedEvidence.entries[0].controlProven, false);
  assert.equal(result.unifiedEvidence.entries[0].recipientRelationshipProven, false);
  assert.equal(result.paymentAuthorized, false);
  assert.equal(preflightWithEvidence({ ...input, proposedAddress: "0x2" }).memoryComparison.status, "differs_from_remembered_claim");
});

test("M1: legacy signed-publication labels remain unverified historical claims", () => {
  const prepared = new PreparedPublications().issue("0x1", "local-test-recipient");
  const record = { ...prepared.candidate, trust: "direct_owner_confirmed_with_signed_consent", independentlyVerified: true };
  const result = preflightWithEvidence({
    counterpartyId: record.counterpartyId, proposedAddress: record.address,
    recalled: [], authorizations: [], evidenceEvents: [{ blobId: "legacy-fixture", record }],
  });
  assert.equal(result.conclusion.status, "matches_observed_address");
  assert.equal(result.unifiedEvidence.entries[0].provenance, "stored_publication_signature_claim_not_reverified");
  assert.equal(result.memoryComparison.independentlyVerified, false);
  assert.equal(result.recipient.verdict, "review_required");
});

test("M1: repeated blob IDs cannot hide conflicting timeline addresses", () => {
  const stage = new PreparedPublications();
  const first = stage.issue("0x1", "local-test-recipient");
  const second = stage.issue("0x2", "local-test-recipient");
  const result = preflightWithEvidence({
    counterpartyId: "local-test-recipient", proposedAddress: "0x1", recalled: [], authorizations: [],
    evidenceEvents: [first, second].map(p => ({ blobId: "same-fixture-blob", record: p.candidate })),
  });
  assert.equal(result.memoryTimeline.status, "address_change_requires_review");
  assert.equal(result.memoryTimeline.distinctAddresses.length, 2);
  assert.equal(result.conclusion.status, "conflicting_observations");
});

test("M3: completed lifecycle accepts the installed SDK's actual return type", () => {
  const completed: Awaited<ReturnType<MemWal["waitForRememberJob"]>> = {
    id: "fixture-job", job_id: "fixture-job", blob_id: "fixture-blob", owner: "fixture-owner", namespace: "test",
  };
  assert.deepEqual(completedMemoryJob(acceptedMemoryJob({ job_id: "fixture-job" }), completed),
    { status: "stored", jobId: "fixture-job", blobId: "fixture-blob" });
  assert.equal(completedMemoryJob(acceptedMemoryJob({ job_id: "fixture-job" }), { blob_id: "" }).status, "failed");
});

test("M5: all shipped inline scripts parse, including escaped evidence rendering", async () => {
  for (const page of ["index", "memory", "history", "verify-wallet", "docs", "contacts", "receive-private"]) {
    const html = await readFile(new URL("../apps/web/" + page + ".html", import.meta.url), "utf8");
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new Script(match[1], { filename: page + ".html" });
  }
  const html = await readFile(new URL("../apps/web/memory.html", import.meta.url), "utf8");
  const helper = html.match(/function escapeHtml\(value\)\{[^\n]+/);
  assert.ok(helper);
  assert.equal(runInNewContext(helper[0] + ';escapeHtml(\'<img src=x onerror="bad()"> &\')'),
    "&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp;");
  for (const match of html.matchAll(/\.innerHTML\s*=\s*`([\s\S]*?)`;/g)) {
    for (const value of match[1].matchAll(/\$\{([^}]+)\}/g))
      assert.ok(value[1].startsWith("escapeHtml(") || value[1].startsWith("sourceReference("), "Dynamic evidence must use an escaping renderer");
  }
  const sourceHelper = html.match(/function sourceReference\(value\)\{[\s\S]*?\n\}/);
  assert.ok(sourceHelper);
  const render = (value: string) => runInNewContext(helper[0] + sourceHelper[0] + ';sourceReference(input)', { URL, input:value });
  assert.match(render('https://example.com/report?x="<img>'), /^<a class="source-link" href="https:\/\/example\.com/);
  assert.ok(!render('https://example.com/report?x="<img>').includes('<img>'));
  for (const value of ['javascript:alert(1)', 'data:text/html,<img src=x>', 'https://user:secret@example.com/', '<img src=x onerror="bad()">']) {
    assert.ok(!render(value).includes('<a '), 'Unsafe URLs must never become links');
    assert.ok(!render(value).includes('<img'), 'Source notes must be escaped');
  }
  assert.ok(!html.includes('onclick="copy('));
});
