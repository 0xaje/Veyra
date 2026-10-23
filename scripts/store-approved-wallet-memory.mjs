// One-time, operator-approved local-only Walrus write of EXACT memory #6.
// Requires authentic portable Sui signature, fixed approved fields, and explicit STORE.
// Never submits a transaction or writes raw signature to Walrus.
// Usage: node --env-file=.env.local --experimental-strip-types scripts/store-approved-wallet-memory.mjs <proof.json> STORE
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { MemWal } from "@mysten-incubation/memwal";
import { prepareWalletControlMemory } from "../src/core/wallet-control-memory.ts";
import { acceptedMemoryJob, completedMemoryJob } from "../src/core/memory-write-state.ts";

const APPROVED = Object.freeze({
 address: "0x83874235f1db9761bcce93a11466a613a4516085da5ccfe121dddc3d63a0b5e8",
 receiptId: "89465417-50d6-4d99-89b6-03b3e58da599",
 signedChallengeIssuedAt: "2026-10-23T20:07:27.050Z",
 signedChallengeExpiresAt: "2026-10-23T20:12:27.050Z",
 claimedVerifiedAt: "2026-10-23T20:07:37.683Z",
 challengeSha256: "11c2fc6a22b1653e97ea437f59f0a3fcb2eb12e9a32951fcae6858b37dd00e25",
});
const [file, confirmation] = process.argv.slice(2);
if (!file || confirmation !== "STORE" || process.argv.length !== 4) {
 console.error("Usage: node --env-file=.env.local --experimental-strip-types scripts/store-approved-wallet-memory.mjs <proof.json> STORE");
 process.exit(2);
}
if (!process.env.MEMWAL_PRIVATE_KEY || !process.env.MEMWAL_ACCOUNT_ID) {
 console.error("Local MemWal credentials unavailable. No write attempted.");
 process.exit(2);
}
let state = { status: "not_attempted" };
try {
 const proof = JSON.parse(await readFile(file, "utf8"));
 const record = await prepareWalletControlMemory(proof, {userApprovedPublicRecord:true});
 for (const [key, expected] of Object.entries(APPROVED))
   if (record[key] !== expected) throw new Error("Record differs from explicitly approved memory #6: " + key);
 if (record.type !== "veyra.wallet_control_memory.v1" ||
     record.paymentAuthorized !== false || record.recipientSafe !== false ||
     record.identityVerified !== false || record.independentlyVerifiedRecipientSafety !== false)
   throw new Error("Record fails safety invariants");
 const payload = JSON.stringify(record);
 const payloadSha256 = createHash("sha256").update(payload).digest("hex");
 const memory = MemWal.create({
  key:process.env.MEMWAL_PRIVATE_KEY,
  accountId:process.env.MEMWAL_ACCOUNT_ID,
  serverUrl:process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
  namespace:process.env.MEMWAL_NAMESPACE || "veyra-dev",
 });
 const health = await memory.health();
 if (health.write_ready !== true || !["ok","healthy"].includes(health.writes))
   throw new Error("MemWal write service not ready; no write attempted");
 console.log(JSON.stringify({stage:"submitting_approved_record",type:record.type,address:record.address,receiptId:record.receiptId,payloadSha256,paymentAuthorized:false}));
 state = acceptedMemoryJob(await memory.remember(payload));
 console.log(JSON.stringify({stage:"submission_result",...state,paymentAuthorized:false}));
 if (state.status !== "pending") throw new Error("MemWal did not accept a valid write job");
 state = completedMemoryJob(state, await memory.waitForRememberJob(state.jobId));
 console.log(JSON.stringify({stage:"completion_result",...state,payloadSha256,paymentAuthorized:false}));
 if (state.status !== "stored") throw new Error("No durable blob ID; memory not counted");
 // Read-only semantic recall. Exact blob and exact record content are required.
 const response = await Promise.race([
   memory.recall({query:`veyra wallet control memory ${record.address} ${record.receiptId}`,limit:50}),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error("Recall timed out")),20000)),
 ]);
 const matches = (response.results ?? []).some(item => {
  if (item?.blob_id !== state.blobId || typeof item.text !== "string") return false;
  try {
   const recalled = JSON.parse(item.text);
   return Object.keys(record).length === Object.keys(recalled).length &&
     Object.keys(record).every(key=>JSON.stringify(record[key])===JSON.stringify(recalled[key]));
  } catch { return false; }
 });
 console.log(JSON.stringify({
  status:matches?"stored_and_verified_via_memwal_recall":"stored_but_recall_not_verified",
  jobId:state.jobId,blobId:state.blobId,payloadSha256,
  paymentAuthorized:false,
  caveat:"Semantic MemWal recall; not direct raw Walrus blob retrieval. Do not retry a completed write merely because recall is unavailable."
 },null,2));
 if (!matches) process.exitCode=1;
} catch(error) {
 console.error(JSON.stringify({
  status:state.status==="stored"?"stored_but_recall_unavailable":state.status==="pending"?"write_outcome_uncertain":"write_not_confirmed",
  state,reason:error instanceof Error?error.message:"Walrus operation failed",
  paymentAuthorized:false,
  warning:"If a job was accepted, check its status before retrying; do not create duplicate memories."
 },null,2));
 process.exitCode=1;
}
