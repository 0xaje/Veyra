// Read-only verification of an already completed MemWal recipient evidence write.
// Usage: node --env-file=.env.local scripts/verify-evidence-memory.mjs <blob-id> <counterparty-id> <address>
import { MemWal } from "@mysten-incubation/memwal";
import { normalizeSuiAddress } from "../src/core/recipient-check.ts";

const [blobId, counterpartyId, address] = process.argv.slice(2);
if (!blobId || !counterpartyId || !address) {
  console.error("Usage: verify-evidence-memory.mjs <blob-id> <counterparty-id> <address>");
  process.exit(2);
}
if (!process.env.MEMWAL_PRIVATE_KEY || !process.env.MEMWAL_ACCOUNT_ID) {
  console.error("MemWal credentials are required in the local environment.");
  process.exit(2);
}
const expectedAddress = normalizeSuiAddress(address);
const memory = MemWal.create({
  key: process.env.MEMWAL_PRIVATE_KEY,
  accountId: process.env.MEMWAL_ACCOUNT_ID,
  serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
  namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
});
const query = `veyra recipient evidence ${counterpartyId} ${expectedAddress}`;
try {
  const response = await Promise.race([
    memory.recall({ query, limit: 50 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Recall timed out")), 20000)),
  ]);
  const items = response.results ?? [];
  const candidates = items.filter(item => item?.blob_id === blobId);
  let matched = false;
  for (const item of candidates) {
    if (typeof item.text !== "string") continue;
    let record;
    try { record = JSON.parse(item.text); } catch { continue; }
    if (record.type !== "veyra.recipient_evidence.v1" ||
        record.counterpartyId !== counterpartyId ||
        normalizeSuiAddress(record.address) !== expectedAddress ||
        !["wallet", "package", "shared_object"].includes(record.addressKind) ||
        !["source_observed", "recipient_reconfirmed", "mismatch_reviewed"].includes(record.eventType) ||
        !["public_official_document", "direct_owner_confirmation", "local_assessment"].includes(record.source?.kind) ||
        record.trust !== "informational_unverified" ||
        record.paymentAuthorized !== false) continue;
    matched = true;
    console.log(JSON.stringify({
      status: "verified_via_memwal_recall",
      blobId: item.blob_id,
      counterpartyId: record.counterpartyId,
      address: record.address,
      addressKind: record.addressKind,
      eventType: record.eventType,
      source: record.source,
      trust: record.trust,
      paymentAuthorized: record.paymentAuthorized,
      caveat: "MemWal semantic recall match; not a direct raw Walrus blob download or proof of ownership."
    }, null, 2));
    break;
  }
  if (!matched) {
    console.log(JSON.stringify({
      status: "not_verified",
      requestedBlobId: blobId,
      returnedResults: items.length,
      exactBlobCandidates: candidates.length,
      reason: "Exact blob ID and expected record were not found in this recall response; absence is not proof of missing storage.",
      paymentAuthorized: false
    }, null, 2));
    process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({
    status: "verification_unavailable",
    reason: error instanceof Error ? error.message : "Recall failed",
    paymentAuthorized: false
  }));
  process.exitCode = 1;
}
