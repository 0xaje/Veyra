import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EncryptedObject} from '@mysten/seal';
import {ExactWalrusReader,EXISTING_PUBLIC_BLOB,MAINNET_MEMORY_PACKAGE,MAINNET_SEAL_COMMITTEE,inspectMainnetCiphertext,verifyExactPublication} from '../src/core/exact-walrus-record.ts';
import {prepareConsentedRecipientConfirmation} from '../src/core/self-service-confirmation.ts';
import type {DurableStorageReceipt} from '../src/core/storage-safeguards.ts';

test('M2: parse an actual downloaded public Walrus ciphertext fixture without claiming decryption',async()=>{
 // Captured from the exact public Mainnet blob on 2026-10-25. Replaying this fixture is not a live read.
 const data=Buffer.from((await readFile(new URL('./fixtures/existing-public-walrus-ciphertext.hex',import.meta.url),'utf8')).trim(),'hex');
 const {parsed,supported,ciphertextHash}=inspectMainnetCiphertext(data);
 assert.equal(supported,true);assert.equal(parsed.packageId,MAINNET_MEMORY_PACKAGE);
 assert.deepEqual(parsed.services,[[MAINNET_SEAL_COMMITTEE,1]]);assert.equal(parsed.threshold,1);
 assert.equal(ciphertextHash,createHash('sha256').update(data).digest('hex'));
 const other=EncryptedObject.serialize({...parsed,packageId:'0x'+'1'.repeat(64)}).toBytes();
 assert.equal(inspectMainnetCiphertext(other).supported,false);
 assert.throws(()=>inspectMainnetCiphertext(new TextEncoder().encode('{"pretend":"encrypted"}')));
});
function fixture(){
 // Pure exact-byte binding fixture. No provider acceptance, upload or download is claimed.
 const prepared=prepareConsentedRecipientConfirmation({address:'0x1',counterpartyId:'local-fixture-recipient'});
 const receipt:DurableStorageReceipt={schema:'veyra.storage_receipt.v1',receiptId:'local-fixture-receipt',jobId:'local-fixture-job',blobId:'local-fixture-blob',address:prepared.candidate.address,counterpartyId:prepared.candidate.counterpartyId,recordHash:prepared.recordHash,storedAt:new Date().toISOString(),status:'completed',paymentAuthorized:false};
 return{prepared,receipt,bytes:new TextEncoder().encode(prepared.candidateJson)};
}
test('M2: exact record bytes must match the durable receipt, address and relationship',()=>{
 const {bytes,receipt}=fixture();const verified=verifyExactPublication(bytes,receipt);
 assert.equal(verified.status,'verified');assert.equal(verified.payloadHashVerified,true);
 assert.equal(verified.identityVerified,false);assert.equal(verified.paymentAuthorized,false);assert.equal(verified.memoryWritten,false);
 assert.equal(verifyExactPublication(bytes,{...receipt,address:'0x2'}).status,'mismatch');
 assert.equal(verifyExactPublication(bytes,{...receipt,counterpartyId:'other'}).status,'mismatch');
 assert.equal(verifyExactPublication(new Uint8Array([...bytes,32]),receipt).status,'mismatch'); // Reserializing JSON would conceal this exact-byte difference.
 assert.throws(()=>verifyExactPublication(bytes,{...receipt,recordHash:'caller-invented-hash'}),/trusted completed/);
});
test('M2: a matching hash cannot promote malformed records or non-wallet identifiers',()=>{
 const {prepared,receipt}=fixture();
 for(const record of [{...prepared.candidate,addressKind:'package'},{...prepared.candidate,paymentAuthorized:true},{...prepared.candidate,network:'testnet'}]){
  const bytes=new TextEncoder().encode(JSON.stringify(record));const recordHash=createHash('sha256').update(bytes).digest('hex');
  assert.equal(verifyExactPublication(bytes,{...receipt,recordHash}).status,'mismatch');
 }
});
test('M2: exact read admission does not become an arbitrary account decryption endpoint',async()=>{
 const reader=new ExactWalrusReader({delegateKey:'',accountId:''});
 await assert.rejects(reader.read('../arbitrary-url'),/blob ID/);
 await assert.rejects(reader.read('unknown-private-blob'),/Approved public receipt/);
 const result=await reader.read(EXISTING_PUBLIC_BLOB);assert.equal(result.status,'configuration_required');
 assert.equal(result.payloadHashVerified,false);assert.equal(result.paymentAuthorized,false);
});
