// Read-only recipient-memory inspection through the real Walrus Memory SDK.
// No recipient record is invented or written by this script.
import { MemWal } from "@mysten-incubation/memwal";
import { checkRecipient } from "../src/core/recipient-check.ts";

const [counterpartyId, proposedAddress] = process.argv.slice(2);
if (!counterpartyId || !proposedAddress) {
  console.error("Usage: node --experimental-strip-types scripts/recipient-memory-check.mjs <counterparty-id> <sui-address>");
  process.exit(2);
}
const key = process.env.MEMWAL_PRIVATE_KEY;
const accountId = process.env.MEMWAL_ACCOUNT_ID;
if (!key || !accountId) {
  console.error("MEMWAL_PRIVATE_KEY and MEMWAL_ACCOUNT_ID must be set privately.");
  process.exit(2);
}
try {
  const memory = MemWal.create({
    key, accountId,
    serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
    namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
  });
  const query = `veyra recipient record sui mainnet counterparty ${counterpartyId}`;
  const recalled = await memory.recall({ query, limit: 20 });
  const records = [];
  for (const item of recalled.results ?? []) {
    if (typeof item.text !== "string") continue;
    let payload;
    try { payload = JSON.parse(item.text); } catch { continue; }
    if (payload?.type !== "veyra.recipient.v1" || payload?.counterpartyId !== counterpartyId ||
        payload?.chain !== "sui" || payload?.network !== "mainnet") continue;
    if (!item.blob_id || !payload.confirmation?.reference || !payload.confirmation?.method ||
        !payload.confirmation?.confirmedAt) continue;
    records.push({ payload, blobId: item.blob_id });
  }
  // Search results are not guaranteed complete or authoritative. Never choose a record
  // automatically when multiple candidate memories exist.
  if (records.length !== 1) {
    console.log(JSON.stringify({
      status: "review_required", counterpartyId, candidateRecordCount: records.length,
      reason: records.length === 0
        ? "No matching structured recipient record retrieved; absence from search is not proof none exists."
        : "Multiple candidate recipient records retrieved; confirmation history needs manual resolution.",
    }, null, 2));
    process.exit(0);
  }
  const candidate = records[0];
  // A stored assertion is NOT independent confirmation. Treat it as a user-asserted
  // record until a separate verification workflow is implemented.
  const result = checkRecipient({
    counterpartyId, proposedAddress, trustedRecord: candidate.payload,
  });
  console.log(JSON.stringify({
    status: "memory_comparison", memoryBlobId: candidate.blobId,
    recordTrust: "user_asserted_unverified",
    ...result,
    warning: "Memory content alone does not independently verify counterparty ownership. Do not authorize payments based solely on this output.",
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", message: error.message }, null, 2));
  process.exitCode = 1;
}
