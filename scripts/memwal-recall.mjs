import { MemWal } from "@mysten-incubation/memwal";
const key = process.env.MEMWAL_PRIVATE_KEY;
const accountId = process.env.MEMWAL_ACCOUNT_ID;
const proofId = process.argv[2];
if (!key || !accountId || !proofId) {
  console.error("Usage: node scripts/memwal-recall.mjs <proofId>; requires MEMWAL_PRIVATE_KEY and MEMWAL_ACCOUNT_ID");
  process.exit(2);
}
if (!/^[0-9a-f-]{36}$/i.test(proofId)) throw new Error("Invalid proof ID");
const statement = `Veyra integration verification ${proofId}. This is a genuine SDK memory-write test, not an observed transfer or a risk finding.`;
const memwal = MemWal.create({
  key,
  accountId,
  serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
  namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
});
const result = await memwal.recall({ query: statement, limit: 20 });
const match = result.results.find(item => item.text === statement && item.blob_id);
if (!match) {
  console.error("FAIL: previously written memory was not found with exact content");
  process.exit(1);
}
console.log(JSON.stringify({
  status: "cross_process_recall_verified",
  proofId,
  blobId: match.blob_id,
  verifiedAt: new Date().toISOString()
}, null, 2));
