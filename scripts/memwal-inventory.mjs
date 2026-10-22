// Read-only, scoped inventory of Veyra's already-known Walrus Memory records.
// No remember(), no write, no wallet signatures, no transfers.
// Search-based recall is not a complete account-wide listing.
import { MemWal } from "@mysten-incubation/memwal";

const key = process.env.MEMWAL_PRIVATE_KEY;
const accountId = process.env.MEMWAL_ACCOUNT_ID;
if (!key || !accountId) {
  console.error("Missing MEMWAL_PRIVATE_KEY or MEMWAL_ACCOUNT_ID in the local environment.");
  process.exit(2);
}
const namespace = process.env.MEMWAL_NAMESPACE || "veyra-dev";
const counterparty = process.argv[2] || "my-sui-wallet";
const proofId = process.argv[3] || "b6b1623b-392a-4e0a-9ff1-4b057f9b3030";
if (!/^[a-zA-Z0-9_-]{1,128}$/.test(counterparty) || !/^[0-9a-f-]{36}$/i.test(proofId)) {
  console.error("Usage: node scripts/memwal-inventory.mjs [counterpartyId] [knownSmokeProofId]");
  process.exit(2);
}
const memwal = MemWal.create({
  key, accountId,
  serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
  namespace,
});
const smokeStatement = `Veyra integration verification ${proofId}. This is a genuine SDK memory-write test, not an observed transfer or a risk finding.`;
const searches = [
  { type: "recipient", query: `veyra recipient record sui mainnet counterparty ${counterparty}` },
  { type: "smoke", query: smokeStatement },
];
const seen = new Map();
const searchStatus = [];
try {
  for (const search of searches) {
    const response = await memwal.recall({ query: search.query, limit: 20 });
    const items = response.results ?? [];
    if (!Array.isArray(items)) throw new Error("Unexpected recall results shape");
    let matched = 0;
    for (const item of items) {
      if (typeof item?.blob_id !== "string" || !item.blob_id || typeof item.text !== "string") continue;
      let classification = null;
      let address = null;
      if (search.type === "smoke" && item.text === smokeStatement) {
        classification = "integration_smoke_test";
      } else if (search.type === "recipient") {
        try {
          const record = JSON.parse(item.text);
          if (record.type === "veyra.recipient.v1" &&
              record.chain === "sui" && record.network === "mainnet" &&
              record.counterpartyId === counterparty &&
              typeof record.address === "string" &&
              typeof record.confirmation?.method === "string" &&
              typeof record.confirmation?.confirmedAt === "string" &&
              typeof record.confirmation?.reference === "string") {
            classification = "recipient_claim";
            address = record.address;
          }
        } catch { /* Unrelated recall text is not a valid recipient record. */ }
      }
      if (!classification) continue;
      matched++;
      if (!seen.has(item.blob_id)) {
        seen.set(item.blob_id, {
          blobId: item.blob_id,
          classification,
          ...(address ? { address } : {}),
          ...(classification === "recipient_claim" ? { counterpartyId: counterparty } : {}),
        });
      }
    }
    searchStatus.push({ searchType: search.type, resultsReturned: items.length, matchingResults: matched, limit: 20 });
  }
  const records = [...seen.values()];
  const recipientRecords = records.filter(r => r.classification === "recipient_claim");
  const smokeRecords = records.filter(r => r.classification === "integration_smoke_test");
  console.log(JSON.stringify({
    status: "scoped_recall_completed",
    network: "walrus-memory",
    namespace,
    checkedAt: new Date().toISOString(),
    searchStatus,
    uniqueMatchingBlobIds: records.length,
    observedRecipientClaimBlobs: recipientRecords.length,
    observedIntegrationSmokeBlobs: smokeRecords.length,
    records,
    qualification: "Not assessed: event rules must be checked independently; smoke-test records must not be represented as qualifying recipient memories.",
    completeness: "Scoped semantic recall only. No exhaustive account listing or total memory count is claimed.",
    safety: "Read-only recall; no new memories, payments, or signatures.",
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "inventory_failed",
    reason: error instanceof Error ? error.message : "Unknown recall error",
    completeness: "No inventory count can be established from a failed recall.",
  }, null, 2));
  process.exitCode = 1;
}
