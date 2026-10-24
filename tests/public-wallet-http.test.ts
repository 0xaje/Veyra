import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PublicationLedger } from "../src/core/publication-ledger.ts";

async function port() {
 const server=createServer();server.listen(0,"127.0.0.1");await once(server,"listening");
 const address=server.address();if(!address||typeof address==="string")throw Error("port unavailable");
 const p=address.port;server.close();await once(server,"close");return p;
}
async function launch(env:NodeJS.ProcessEnv, p:number) {
 const child=spawn(process.execPath,["--experimental-strip-types","scripts/preflight-api.mjs"],{
  cwd:process.cwd(),env:{...process.env,...env,PORT:String(p),VEYRA_HOST:"127.0.0.1"},stdio:"ignore"
 });
 const base="http://127.0.0.1:"+p;
 for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error("server exited");try{if((await fetch(base+"/health")).ok)return {child,base}}catch{}await new Promise(r=>setTimeout(r,100))}
 child.kill();throw Error("server not ready");
}
async function stop(child:ReturnType<typeof spawn>){if(child.exitCode===null){child.kill("SIGTERM");await Promise.race([once(child,"exit"),new Promise(r=>setTimeout(r,1500))]);if(child.exitCode===null)child.kill("SIGKILL")}}
const ADDRESS="0x"+"a".repeat(64);
const post=(base:string,path:string,origin?:string)=>fetch(base+path,{method:"POST",headers:{"content-type":"application/json",...(origin?{origin}:{})},body:JSON.stringify({address:ADDRESS})});

test("public wallet proof remains disabled by default", {timeout:15000},async()=>{
 const p=await port();const {child,base}=await launch({VEYRA_PUBLIC_MODE:"true",VEYRA_PUBLIC_WALLET_PROOF:"false"},p);
 try{const health=await (await fetch(base+"/health")).json();assert.equal(health.walletProofEnabled,false);const res=await post(base,"/v1/wallet-challenge","https://veyra.example");assert.equal(res.status,403);assert.equal((await res.json()).paymentAuthorized,false)}
 finally{await stop(child)}
});
test("public wallet proof requires exact HTTPS origin and remains transaction-free", {timeout:15000},async()=>{
 const p=await port();const origin="https://veyra.example";
 const {child,base}=await launch({VEYRA_PUBLIC_MODE:"true",VEYRA_PUBLIC_WALLET_PROOF:"true",VEYRA_PUBLIC_ORIGIN:origin},p);
 try{
  const health=await (await fetch(base+"/health")).json();assert.equal(health.walletProofEnabled,true);
  assert.equal((await post(base,"/v1/wallet-challenge")).status,403);
  assert.equal((await post(base,"/v1/wallet-challenge","https://evil.example")).status,403);
  const res=await post(base,"/v1/wallet-challenge",origin);
  assert.equal(res.status,200);const data=await res.json();
  assert.equal(data.status,"challenge_issued");assert.equal(data.paymentAuthorized,false);
  assert.equal(data.address,ADDRESS);
  const write=await fetch(base+"/v1/recipient-memory",{method:"POST",headers:{"content-type":"application/json",origin},body:"{}"});
  assert.equal(write.status,403);
 }finally{await stop(child)}
});
test("public wallet proof rejects requests beyond per-client allowance", {timeout:15000},async()=>{
 const p=await port(),origin="https://veyra.example";
 const {child,base}=await launch({VEYRA_PUBLIC_MODE:"true",VEYRA_PUBLIC_WALLET_PROOF:"true",VEYRA_PUBLIC_ORIGIN:origin},p);
 try{
  for(let i=0;i<12;i++)assert.equal((await post(base,"/v1/wallet-challenge",origin)).status,200);
  const res=await post(base,"/v1/wallet-challenge",origin);
  assert.equal(res.status,429);assert.equal((await res.json()).paymentAuthorized,false);
 }finally{await stop(child)}
});

test("M3: public publication cannot be enabled by an environment flag", {timeout:15000},async()=>{
 const p=await port();
 const {child,base}=await launch({VEYRA_PUBLIC_MODE:"true",VEYRA_PUBLIC_WALLET_PROOF:"false",VEYRA_ENABLE_SELF_SERVICE_WRITES:"true"},p);
 try{
  const health=await (await fetch(base+"/health")).json();
  assert.equal(health.memoryWritesEnabled,false);
  assert.equal(health.selfServiceWritesEnabled,false);
  assert.equal(health.publicationSecurityGatesComplete,false);
  for(const path of ["/v1/self-service/prepare-consent","/v1/self-service/confirm-and-store","/v1/self-service/recover"]){
   const response=await post(base,path,"https://veyra.example");
   assert.equal(response.status,403);
   assert.equal((await response.json()).paymentAuthorized,false);
  }
  assert.equal((await fetch(base+"/v1/self-service/receipts?address="+ADDRESS)).status,403);
 }finally{await stop(child)}
});

test("M3: actual local HTTP preparation and pending status survive server restart", {timeout:20000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),"veyra-http-publication-"));
 const path=join(dir,"state.sqlite");
 const p=await port();
 const env={VEYRA_PUBLIC_MODE:"false",VEYRA_PUBLIC_WALLET_PROOF:"false",VEYRA_PUBLICATION_DB:path,MEMWAL_PRIVATE_KEY:"",MEMWAL_ACCOUNT_ID:""};
 let server=await launch(env,p);
 try{
  const preparedResponse=await fetch(server.base+"/v1/self-service/prepare-consent",{
   method:"POST",headers:{"content-type":"application/json",origin:server.base},
   body:JSON.stringify({address:ADDRESS,counterpartyId:"local-test-recipient"})
  });
  assert.equal(preparedResponse.status,200);
  const prepared=await preparedResponse.json();
  assert.equal(prepared.status,"consent_prepared");
  await stop(server.child);
  // Explicit local reservation fixture: no signature/provider/store is claimed.
  const ledger=new PublicationLedger(path,{maxDailyWritesPerWallet:3,maxGlobalDailyWrites:50});
  assert.equal(ledger.get(prepared.consentPayload)?.candidateJson,JSON.stringify(prepared.candidateRecord));
  ledger.reserve(prepared.consentPayload);ledger.close();
  server=await launch(env,p);
  const status=await fetch(server.base+"/v1/self-service/jobs?nonce="+prepared.consentPayload.nonce);
  assert.equal(status.status,202);
  const state=await status.json();
  assert.equal(state.phase,"reserved");assert.equal(state.status,"pending");
  assert.equal(state.receipt,null);assert.equal(state.paymentAuthorized,false);
  const recovery=await fetch(server.base+"/v1/self-service/recover",{
   method:"POST",headers:{"content-type":"application/json",origin:server.base},
   body:JSON.stringify({nonce:prepared.consentPayload.nonce})
  });
  assert.equal(recovery.status,202);
  assert.match((await recovery.json()).limitation,/automatic resubmission is forbidden/);
  const foreign=await fetch(server.base+"/v1/self-service/recover",{
   method:"POST",headers:{"content-type":"application/json",origin:"https://evil.example"},body:"{}"
  });
  assert.equal(foreign.status,403);
 }finally{await stop(server.child);await rm(dir,{recursive:true,force:true})}
});
