// Read-only local proof verifier. Does not access credentials or write to Walrus.
// Usage: node --experimental-strip-types scripts/verify-wallet-proof.mjs ./wallet-proof.json
import { readFile } from "node:fs/promises";
import { verifyPortableWalletProof } from "../src/core/portable-wallet-proof.ts";
if (process.argv.length !== 3) {
 console.error("Usage: node --experimental-strip-types scripts/verify-wallet-proof.mjs <proof.json>");
 process.exit(2);
}
try {
 const proof=JSON.parse(await readFile(process.argv[2],"utf8"));
 const result=await verifyPortableWalletProof(proof);
 console.log(JSON.stringify(result,null,2));
} catch(error) {
 console.error(JSON.stringify({status:"proof_invalid",reason:error instanceof Error?error.message:"Invalid proof",paymentAuthorized:false,walrusMemoryWritten:false}));
 process.exitCode=1;
}
