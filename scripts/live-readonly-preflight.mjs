// Genuine hosted read-only acceptance. No wallet signature, publication or payment.
// Uses only already-public recipient/digest references recorded in the repository.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const base = "https://veyra-rs1l.onrender.com";
const expected = process.env.EXPECTED_DEPLOY_COMMIT;
const address = "0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7f";
const digest = "5BfxtP2UZbDMJAwm4bNjGvJuiP3fZW9QKghuwoYa7Nst";
const report = {
  schema: "veyra.live_readonly_acceptance.v1", startedAt: new Date().toISOString(),
  base, expectedCommit: expected || null, checks: [], status: "running",
};
async function json(path, body) {
  const response = await fetch(base + path, {
    ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45_000),
  });
  return { status: response.status, body: await response.json() };
}
async function check(name, fn) {
  const detail = await fn();
  report.checks.push({ name, status: "passed", observedAt: new Date().toISOString(), detail });
  console.log(JSON.stringify(report.checks.at(-1)));
}
try {
  await check("deployed_revision_and_read_only_boundary", async () => {
    let health;
    const deadline = Date.now() + 8 * 60_000;
    do {
      try {
        const result = await json("/health");
        if (result.status === 200 && (!expected || result.body.buildCommit === expected)) {
          health = result.body; break;
        }
      } catch { /* Deployment may be replacing or waking its instance. */ }
      await new Promise(resolve => setTimeout(resolve, 15_000));
    } while (Date.now() < deadline);
    assert.ok(health, "Expected deployed revision did not become healthy");
    assert.equal(health.publicMode, true);
    assert.equal(health.memoryWritesEnabled, health.assessmentMemorySavingEnabled === true);
    assert.equal(health.recipientPublicationEnabled, false);
    assert.equal(health.selfServiceWritesEnabled, health.assessmentMemorySavingEnabled === true);
    assert.equal(health.paymentAuthorized, false);
    return { buildCommit: health.buildCommit, publicRecipientWrites: false, assessmentSaving: health.assessmentMemorySavingEnabled === true };
  });
  await check("public_pages_available", async () => {
    for (const path of ["/", "/verify-wallet", "/memory", "/history", "/docs", "/contacts", "/receive-private"]) {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(20_000) });
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("content-type") || "", /text\/html/);
      assert.match(await response.text(), /Veyra|veyra/);
    }
    return { pageCount: 7, scope: "HTTP availability; not a browser or accessibility audit" };
  });
  await check("public_write_routes_reject_before_processing", async () => {
    for (const path of ["/v1/self-service/prepare-consent", "/v1/self-service/confirm-and-store"]) {
      const response = await json(path, {});
      assert.equal(response.status, 403); assert.equal(response.body.paymentAuthorized, false);
    }
    return { rejected: true, writeAttemptWithValidPayload: false };
  });
  await check("real_walrus_match_and_unified_timeline", async () => {
    const response = await json("/v1/preflight", { counterpartyId: "friend-1-sui-recipient", proposedAddress: address });
    assert.equal(response.status, 200); const data = response.body;
    assert.equal(data.providers.walrusRecipientEvidence, "observed");
    assert.equal(data.conclusion.status, "matches_observed_address");
    assert.equal(data.memoryComparison.status, "matches_remembered_claim");
    assert.ok(data.memoryTimeline.entries.length > 0);
    assert.ok(data.memoryComparison.evidenceBlobIds.length > 0);
    assert.equal(data.paymentAuthorized, false);
    return { conclusion: data.conclusion.status, timelineStatus: data.memoryTimeline.status,
      evidenceBlobIds: data.memoryComparison.evidenceBlobIds, exactIdVerification: data.retrieval.exactIdVerification,
      independentlyVerified: false };
  });
  await check("real_walrus_changed_address_warning", async () => {
    const response = await json("/v1/preflight", { counterpartyId: "friend-1-sui-recipient", proposedAddress: address.slice(0,-1) + "e" });
    assert.equal(response.status, 200); const data = response.body;
    assert.equal(data.conclusion.status, "differs_from_observed_address");
    assert.equal(data.memoryComparison.status, "differs_from_remembered_claim");
    assert.equal(data.action, "manual_review_required"); assert.equal(data.paymentAuthorized, false);
    return { conclusion: data.conclusion.status, scope: "Controlled read-only address alteration, not a real attack or transfer" };
  });
  await check("genuine_tatum_mainnet_transaction_observation", async () => {
    const response = await json("/v1/preflight", { counterpartyId: "friend-1-sui-recipient", proposedAddress: address, transactionDigest: digest });
    assert.equal(response.status, 200); const data = response.body;
    assert.equal(data.providers.tatum, "observed");
    assert.equal(data.transactionInvestigation.digest, digest);
    assert.equal(data.transactionInvestigation.network, "sui-mainnet");
    assert.equal(data.transactionInvestigation.method, "LedgerService/GetTransaction");
    assert.equal(data.historicalAddressObserved, false);
    assert.equal(data.paymentAuthorized, false);
    return { digest, checkedAt: data.transactionInvestigation.checkedAt,
      scope: "Unrelated historical transaction; no recipient ownership or payment proof" };
  });
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = error instanceof Error ? error.message : "Acceptance failed";
  console.error(report.error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile("live-readonly-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
}
