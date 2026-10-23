// Offline preparation only: checks the actual wallet signature and prints the proposed
// public Walrus payload. Does not load credentials or contact MemWal.
// Usage: node --experimental-strip-types scripts/prepare-wallet-control-memory.mjs <proof.json>
import { readFile } from "node:fs/promises";
import { prepareWalletControlMemory } from "../src/core/wallet-control-memory.ts";
if (process.argv.length !== 3) {
 console.error("Usage: node --experimental-strip-types scripts/prepare-wallet-control-memory.mjs <proof.json>");
 process.exit(2);
}
try {
 const proof=JSON.parse(await readFile(process.argv[2],"utf8"));
 // This flag only allows PREPARATION of a public candidate; never triggers storage.
 const record=await prepareWalletControlMemory(proof,{userApprovedPublicRecord:true});
 console.log(JSON.stringify({status:"prepared_not_stored",record,
  nextStep:"Review the exact public record. A separate explicit storage approval and local MemWal write are required.",
  walrusMemoryWritten:false,paymentAuthorized:false},null,2));
} catch(error) {
 console.error(JSON.stringify({status:"preparation_failed",reason:error instanceof Error?error.message:"Invalid proof",walrusMemoryWritten:false,paymentAuthorized:false}));
 process.exitCode=1;
}
