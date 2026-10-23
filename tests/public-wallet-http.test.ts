import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

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
