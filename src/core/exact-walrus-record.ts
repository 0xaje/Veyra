import { createHash } from 'node:crypto';
import { EncryptedObject, SealClient, SessionKey } from '@mysten/seal';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from './recipient-check.ts';
import type { DurableStorageReceipt } from './storage-safeguards.ts';

// Public deployment identifiers from the official Walrus Memory app and Sui SEAL provider docs.
// Unknown ciphertext profiles fail closed; no private SDK members or invented relayer routes.
export const MAINNET_MEMORY_PACKAGE = '0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5';
export const MAINNET_MEMORY_REGISTRY = '0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f';
export const MAINNET_SEAL_COMMITTEE = '0x686098f1439237fff9f36b99c7329683c22979d2005c2465cb891acb012a7595';
export const EXISTING_PUBLIC_BLOB = 'fHD4G1o_hmpLohp1FasnNAZuCB27WpjGdfgsvU9SgQw';
const AGGREGATOR = 'https://aggregator.walrus-mainnet.walrus.space';
const SEAL_AGGREGATOR = 'https://seal-aggregator-mainnet.mystenlabs.com';
const SUI_GRPC = 'https://fullnode.mainnet.sui.io:443';
const MAX_BYTES = 128 * 1024;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export type ExactRecordResult = {
  status: 'verified' | 'read_unanchored' | 'mismatch' | 'unavailable' | 'configuration_required' | 'unsupported_ciphertext';
  blobId: string; payloadHashVerified: boolean; retrievedAt: string;
  recordHash?: string; ciphertextHash?: string; reason?: string;
  identityVerified: false; paymentAuthorized: false; memoryWritten: false;
};
function result(blobId: string, status: ExactRecordResult['status'], extra: Partial<ExactRecordResult> = {}): ExactRecordResult {
  return {blobId,status,retrievedAt:new Date().toISOString(),...extra,payloadHashVerified:status==='verified',identityVerified:false,paymentAuthorized:false,memoryWritten:false};
}
export function inspectMainnetCiphertext(data: Uint8Array) {
  const parsed = EncryptedObject.parse(data);
  const supported = normalizeSuiAddress(parsed.packageId) === MAINNET_MEMORY_PACKAGE &&
    parsed.threshold === 1 && parsed.services.length === 1 &&
    normalizeSuiAddress(parsed.services[0][0]) === MAINNET_SEAL_COMMITTEE && parsed.services[0][1] === 1 &&
    /^[a-f0-9]+$/i.test(parsed.id) && parsed.id.length >= 80 && parsed.id.length % 2 === 0;
  return {parsed,supported,ciphertextHash:digest(data)};
}
/** Checks exact UTF-8 bytes against the durable server receipt, not reserialized/caller-supplied JSON. */
export function verifyExactPublication(data: Uint8Array, receipt: DurableStorageReceipt): ExactRecordResult {
  if(!receipt || receipt.schema !== 'veyra.storage_receipt.v1' || receipt.status !== 'completed' ||
    !/^[a-f0-9]{64}$/.test(receipt.recordHash) || !/^[A-Za-z0-9_-]{1,256}$/.test(receipt.blobId))
    throw new Error('A trusted completed storage receipt is required');
  const recordHash=digest(data);
  if(recordHash!==receipt.recordHash)return result(receipt.blobId,'mismatch',{recordHash,reason:'Downloaded plaintext differs from the signed record hash'});
  try {
    const record=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
    if(record.type!=='veyra.recipient_evidence.v1'||record.chain!=='sui'||record.network!=='mainnet'||
      record.addressKind!=='wallet'||record.recipientEligible!==true||record.eventType!=='recipient_reconfirmed'||
      record.source?.kind!=='direct_owner_confirmation'||record.trust!=='informational_unverified'||
      record.independentlyVerified!==false||record.paymentAuthorized!==false||record.counterpartyId!==receipt.counterpartyId||
      normalizeSuiAddress(record.address)!==normalizeSuiAddress(receipt.address))throw new Error('Binding mismatch');
    return result(receipt.blobId,'verified',{recordHash});
  } catch { return result(receipt.blobId,'mismatch',{recordHash,reason:'Downloaded record does not match receipt scope or receiving address'}); }
}
async function bytesFrom(response: Response) {
  if(!response.ok || !response.body)throw new Error('Download unavailable');
  if(Number(response.headers.get('content-length'))>MAX_BYTES)throw new Error('Download exceeds limit');
  const chunks:Uint8Array[]=[];let size=0;const reader=response.body.getReader();
  try { for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw new Error('Download exceeds limit');chunks.push(value);} }
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return all;
}

export class ExactWalrusReader {
  private delegateKey: string;
  private accountId: string;
  private sealApiKey: string;
  private cache = new Map<string,{until:number,value:ExactRecordResult}>();
  private pending = new Map<string,Promise<ExactRecordResult>>();
  constructor(config:{delegateKey:string;accountId:string;sealApiKey?:string}) {
    this.delegateKey=config.delegateKey;this.accountId=config.accountId;this.sealApiKey=config.sealApiKey||'';
  }
  async read(blobId:string, receipt?:DurableStorageReceipt):Promise<ExactRecordResult> {
    if(!/^[A-Za-z0-9_-]{1,256}$/.test(blobId))throw new Error('Valid blob ID required');
    // Callers may only read a completed public receipt, or this already-public integration example.
    if((!receipt && blobId!==EXISTING_PUBLIC_BLOB)||(receipt&&receipt.blobId!==blobId))throw new Error('Approved public receipt or example required');
    const key=blobId+':'+(receipt?digest(new TextEncoder().encode(JSON.stringify([receipt.recordHash,receipt.address,receipt.counterpartyId]))):'unanchored'),cached=this.cache.get(key);
    if(cached&&cached.until>Date.now())return cached.value;
    if(this.pending.has(key))return this.pending.get(key)!;
    if(this.pending.size>=2)return result(blobId,'unavailable',{reason:'Exact-read capacity reached'});
    const task=this.perform(blobId,receipt).then(value=>{
      if(this.cache.size>=100)this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key,{until:Date.now()+5*60_000,value});return value;
    }).finally(()=>this.pending.delete(key));this.pending.set(key,task);return task;
  }
  private async perform(blobId:string,receipt?:DurableStorageReceipt):Promise<ExactRecordResult> {
    if(!this.delegateKey||!this.accountId)return result(blobId,'configuration_required',{reason:'Service MemWal credentials are not configured'});
    const signal=AbortSignal.timeout(25_000);
    const boundedFetch:typeof fetch=(input,init)=>fetch(input,{...init,redirect:'error',signal:init?.signal?AbortSignal.any([signal,init.signal]):signal});
    let stage='Walrus download';
    try {
      const ciphertext=await bytesFrom(await boundedFetch(AGGREGATOR+'/v1/blobs/'+blobId));
      stage='ciphertext parsing';
      const header=inspectMainnetCiphertext(ciphertext);
      if(!header.supported)return result(blobId,'unsupported_ciphertext',{ciphertextHash:header.ciphertextHash,reason:'Ciphertext package or SEAL committee profile is unsupported'});
      if(!this.sealApiKey)return result(blobId,'configuration_required',{ciphertextHash:header.ciphertextHash,reason:'Mainnet SEAL committee requires an Enoki API key (MEMWAL_SEAL_API_KEY)'});
      const key=this.delegateKey.trim();
      const signer=Ed25519Keypair.fromSecretKey(/^(0x)?[a-f0-9]{64}$/i.test(key)?Uint8Array.from(Buffer.from(key.replace(/^0x/i,''),'hex')):key);
      const suiClient=new SuiGrpcClient({network:'mainnet',baseUrl:SUI_GRPC,fetch:boundedFetch});
      const accountId=normalizeSuiAddress(this.accountId);
      stage='Mainnet account read';
      const account=await suiClient.getObject({objectId:accountId,include:{json:true}});
      const fields=account.object.json as Record<string,any>|null;
      if(account.object.type!==MAINNET_MEMORY_PACKAGE+'::account::MemWalAccount'||fields?.active!==true||
        typeof fields.owner!=='string'||header.parsed.id.slice(-80,-16)!==normalizeSuiAddress(fields.owner).slice(2))
        return result(blobId,'unavailable',{reason:'Ciphertext does not bind to the configured active MemWal account'});
      stage='SEAL session creation';
      const session=await SessionKey.create({address:signer.toSuiAddress(),packageId:MAINNET_MEMORY_PACKAGE,ttlMin:2,signer,suiClient});
      await session.setPersonalMessageSignature((await signer.signPersonalMessage(session.getPersonalMessage())).signature);
      const tx=new Transaction();tx.moveCall({target:MAINNET_MEMORY_PACKAGE+'::account::seal_approve',arguments:[
        tx.pure.vector('u8',Array.from(Buffer.from(header.parsed.id,'hex'))),tx.object(MAINNET_MEMORY_REGISTRY),tx.object(accountId)]});
      // Build policy-call bytes only. This code never submits or executes a chain transaction.
      stage='SEAL policy preparation';
      const txBytes=await tx.build({client:suiClient,onlyTransactionKind:true});
      const seal=new SealClient({suiClient,serverConfigs:[{objectId:MAINNET_SEAL_COMMITTEE,weight:1,
        aggregatorUrl:SEAL_AGGREGATOR,apiKeyName:'X-API-Key',apiKey:this.sealApiKey}],verifyKeyServers:true,timeout:10_000,fetch:boundedFetch});
      stage='SEAL decryption';
      const plaintext=await seal.decrypt({data:ciphertext,sessionKey:session,txBytes,checkShareConsistency:true});
      if(plaintext.length>MAX_BYTES)throw new Error('Record exceeds limit');
      if(receipt)return {...verifyExactPublication(plaintext,receipt),ciphertextHash:header.ciphertextHash};
      // No trusted historical receipt exists for this example. Download/decrypt is not hash anchoring.
      JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));
      return result(blobId,'read_unanchored',{recordHash:digest(plaintext),ciphertextHash:header.ciphertextHash,
        reason:'Exact blob downloaded and decrypted; no trusted historical publication receipt was supplied'});
    } catch {return result(blobId,'unavailable',{reason:'Exact '+stage+' failed; no verification is claimed'});}
  }
}
