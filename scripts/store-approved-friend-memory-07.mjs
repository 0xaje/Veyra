// ONE-TIME operator-approved write of EXACT Veyra memory #7.
// Run only once. If a job is accepted, never blindly retry.
// Usage: node --env-file=.env.local --experimental-strip-types scripts/store-approved-friend-memory-07.mjs STORE
import { createHash } from "node:crypto";
import { MemWal } from "@mysten-incubation/memwal";
import { prepareRecipientEvidenceEvent } from "../src/core/recipient-evidence-event.ts";
import { acceptedMemoryJob, completedMemoryJob } from "../src/core/memory-write-state.ts";

const APPROVED = Object.freeze({
  counterpartyId: "friend-1-sui-recipient",
  address: "0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7f",
  addressKind: "wallet",
  eventType: "recipient_reconfirmed",
  source: {
    kind: "direct_owner_confirmation",
    reference: "Operator reports friend confirmed intended Sui receiving address and consented to public Walrus storage; original message not independently reviewed",
    observedAt: "2026-10-23T22:33:54.962Z",
  },
});
if (process.argv.length !== 3 || process.argv[2] !== "STORE") {
  console.error("Usage: node --env-file=.env.local --experimental-strip-types scripts/store-approved-friend-memory-07.mjs STORE");
  process.exit(2);
}
if (!process.env.MEMWAL_PRIVATE_KEY || !process.env.MEMWAL_ACCOUNT_ID) {
  console.error("Local MemWal credentials unavailable; no write attempted.");
  process.exit(2);
}
let state = {status:"not_attempted"};
try {
  const record = prepareRecipientEvidenceEvent({...APPROVED,userApprovedStorage:true});
  if (record.type !== "veyra.recipient_evidence.v1" ||
      record.chain !== "sui" || record.network !== "mainnet" ||
      record.address !== APPROVED.address ||
      record.source.observedAt !== APPROVED.source.observedAt ||
      record.trust !== "informational_unverified" ||
      record.independentlyVerified !== false ||
      record.paymentAuthorized !== false ||
      record.warning !== "No ownership or payment safety is established.") {
    throw new Error("Proposed record differs from approved record or safety invariants");
  }
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
  console.log(JSON.stringify({stage:"submitting_approved_record",type:record.type,address:record.address,payloadSha256,paymentAuthorized:false}));
  state = acceptedMemoryJob(await memory.remember(payload));
  console.log(JSON.stringify({stage:"submission_result",...state,paymentAuthorized:false}));
  if (state.status !== "pending") throw new Error("MemWal did not accept a valid write job");
  state = completedMemoryJob(state, await memory.waitForRememberJob(state.jobId));
  console.log(JSON.stringify({stage:"completion_result",...state,payloadSha256,paymentAuthorized:false}));
  if (state.status !== "stored") throw new Error("No durable blob ID; memory not counted");
  const response = await Promise.race([
    memory.recall({query:`veyra recipient evidence friend-1-sui-recipient ${record.address}`,limit:50}),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error("Recall timed out")),20000)),
  ]);
  const matches = (response.results??[]).some(item=>{
    if(item?.blob_id!==state.blobId || typeof item.text!=="string") return false;
    try {
      const recalled=JSON.parse(item.text);
      return Object.keys(record).length===Object.keys(recalled).length &&
        Object.keys(record).every(key=>JSON.stringify(record[key])===JSON.stringify(recalled[key]));
    } catch {return false;}
  });
  console.log(JSON.stringify({
    status:matches?"stored_and_verified_via_memwal_recall":"stored_but_recall_not_verified",
    jobId:state.jobId,blobId:state.blobId,payloadSha256,paymentAuthorized:false,
    caveat:"MemWal semantic recall, not raw Walrus blob retrieval. Do not repeat a completed write.",
  },null,2));
  if(!matches)process.exitCode=1;
} catch(error) {
  console.error(JSON.stringify({
    status:state.status==="stored"?"stored_but_recall_unavailable":state.status==="pending"?"write_outcome_uncertain":"write_not_confirmed",
    state,reason:error instanceof Error?error.message:"Walrus operation failed",
    paymentAuthorized:false,
    warning:"Check the accepted job before any retry; never duplicate a completed write.",
  },null,2));
  process.exitCode=1;
}
