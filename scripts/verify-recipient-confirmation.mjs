// Local-only validation of a self-service recipient confirmation export.
// Usage: node --experimental-strip-types scripts/verify-recipient-confirmation.mjs <file.json>
// Does not store, submit, or authorize anything.
import { readFile } from "node:fs/promises";
import { normalizeSuiAddress } from "../src/core/recipient-check.ts";
import { verifyPortableWalletProof } from "../src/core/portable-wallet-proof.ts";
const file=process.argv[2];
if(!file||process.argv.length!==3){console.error("Usage: node --experimental-strip-types scripts/verify-recipient-confirmation.mjs <file.json>");process.exit(2);}
try{
 const input=JSON.parse(await readFile(file,"utf8"));
 if(input?.type!=="veyra.recipient_confirmation_package.v1"||input.chain!=="sui"||input.network!=="mainnet"||
   input.intent!=="I confirm this connected Sui Mainnet address is where I intend to receive funds."||
   input.consent!=="I consent to sharing this confirmation privately for Veyra review. Any public Walrus storage requires separate explicit approval."||
   input.attestation!=="user_interface_checkbox_not_cryptographically_signed"||
   input.independentlyVerifiedRecipientSafety!==false||input.paymentAuthorized!==false||input.walrusMemoryWritten!==false)
  throw new Error("Unexpected recipient confirmation fields");
 const address=normalizeSuiAddress(input.address);
 const proof=await verifyPortableWalletProof(input.walletControlProof);
 if(proof.address!==address)throw new Error("Wallet proof address differs from recipient address");
 const consentAt=Date.parse(input.consentCapturedAt);
 if(!Number.isFinite(consentAt)||new Date(consentAt).toISOString()!==input.consentCapturedAt||consentAt>Date.now())
  throw new Error("Invalid consent timestamp");
 console.log(JSON.stringify({status:"recipient_confirmation_package_verified",address,
  walletControlProof:"cryptographically_verified",recipientIntent:"self_reported_unsigned",
  consent:"checkbox_attested_not_independently_verified",publicStorageApproved:false,
  paymentAuthorized:false,walrusMemoryWritten:false,
  nextStep:"Separately confirm explicit public Walrus storage permission and review exact public record before local-only write."},null,2));
}catch(error){console.error(JSON.stringify({status:"recipient_confirmation_not_verified",error:error instanceof Error?error.message:"Invalid package",paymentAuthorized:false}));process.exitCode=1;}
