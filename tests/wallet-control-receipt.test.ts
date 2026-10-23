import test from "node:test";
import assert from "node:assert/strict";
import { prepareWalletControlReceipt } from "../src/core/wallet-control-receipt.ts";

const verified = () => ({
 status:"wallet_control_verified" as const,
 address:"0x"+"a".repeat(64),
 verifiedAt:new Date().toISOString(),
 proof:"valid_sui_personal_message_signature" as const,
 independentlyVerified:true as const,
 identityVerified:false as const,
 recipientSafe:false as const,
 paymentAuthorized:false as const,
});

test("successful verification prepares a non-secret, non-stored receipt",()=>{
 const receipt=prepareWalletControlReceipt(verified());
 assert.equal(receipt.type,"veyra.wallet_control_observation.v1");
 assert.equal(receipt.storageStatus,"prepared_not_stored");
 assert.equal(receipt.paymentAuthorized,false);
 assert.equal(receipt.identityVerified,false);
 assert.equal(receipt.recipientSafe,false);
 assert.equal(receipt.verificationMethod,"sui:signPersonalMessage");
 assert.equal("signature" in receipt,false);
 assert.equal("privateKey" in receipt,false);
});
test("unverified result cannot create receipt",()=>{
 assert.throws(()=>prepareWalletControlReceipt({...verified(),status:"invalid_signature"} as never));
});
test("stale verification cannot create receipt",()=>{
 assert.throws(()=>prepareWalletControlReceipt({...verified(),verifiedAt:new Date(Date.now()-11*60_000).toISOString()}));
});
test("receipt rejects claims of payment authorization",()=>{
 assert.throws(()=>prepareWalletControlReceipt({...verified(),paymentAuthorized:true} as never));
});
