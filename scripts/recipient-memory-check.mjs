// Read-only Walrus Memory preflight. Recalled content is untrusted until
// matched against an independently maintained local authorization file.
// This command never sends a transaction or writes a memory.
import { readFile } from "node:fs/promises";
import { MemWal } from "@mysten-incubation/memwal";
import { normalizeSuiAddress } from "../src/core/recipient-check.ts";
import { preflightRememberedRecipient } from "../src/core/recipient-preflight.ts";

const [counterpartyId, rawAddress, authPath] = process.argv.slice(2);
if (!counterpartyId || !rawAddress) {
  console.error("Usage: node scripts/recipient-memory-check.mjs <counterparty-id> <sui-address> [local-authorizations.json]");
  process.exit(2);
}
try {
  const proposedAddress = normalizeSuiAddress(rawAddress);
  const key = process.env.MEMWAL_PRIVATE_KEY;
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) throw new Error("Missing MEMWAL_PRIVATE_KEY or MEMWAL_ACCOUNT_ID");
  // An authorization file is only a local user assertion. Its provenance,
  // integrity and secure storage must be established before real payment use.
  let authorizations = [];
  if (authPath) {
    const parsed = JSON.parse(await readFile(authPath, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Authorization file must contain an array");
    authorizations = parsed;
  }
  const memory = MemWal.create({
    key, accountId,
    serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
    namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
  });
  const query = `veyra recipient record sui mainnet counterparty ${counterpartyId}`;
  const recalled = await memory.recall({ query, limit: 20 });
  const records = [];
  for (const item of recalled.results ?? []) {
    if (typeof item.text !== "string" || typeof item.blob_id !== "string") continue;
    let payload;
    try { payload = JSON.parse(item.text); } catch { continue; }
    if (payload?.type !== "veyra.recipient.v1" ||
        payload?.counterpartyId !== counterpartyId ||
        payload?.chain !== "sui" || payload?.network !== "mainnet" ||
        typeof payload?.address !== "string" ||
        typeof payload?.confirmation?.method !== "string" ||
        typeof payload?.confirmation?.reference !== "string" ||
        typeof payload?.confirmation?.confirmedAt !== "string") continue;
    records.push({ blobId: item.blob_id, record: payload });
  }
  const result = preflightRememberedRecipient({
    counterpartyId, proposedAddress, recalled: records, authorizations,
  });
  console.log(JSON.stringify({
    status: "read_only_preflight",
    ...result,
    recalledCandidateCount: records.length,
    authorizationSource: authPath ? "local_file_unverified_integrity" : "none",
    warning: "No payment is authorized. Local authorization provenance and file integrity have not been independently established.",
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "preflight_failed", reason: error instanceof Error ? error.message : "Unknown failure",
    guidance: "No payment authorized. Check credentials, inputs and Walrus availability.",
  }, null, 2));
  process.exitCode = 1;
}
