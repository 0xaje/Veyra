import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

async function unusedPort(){const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const a=server.address();if(!a||typeof a==='string')throw Error('No port');server.close();await once(server,'close');return a.port;}
async function launch(t:{after:(fn:()=>Promise<void>)=>void},publicMode=false,enabled=true){
 const dir=await mkdtemp(join(tmpdir(),'veyra-private-http-')),p=await unusedPort(),base='http://127.0.0.1:'+p;
 const origin=publicMode?'https://veyra.example':base;
 const env={...process.env,PORT:String(p),VEYRA_HOST:'127.0.0.1',VEYRA_PUBLIC_MODE:String(publicMode),
  VEYRA_PUBLIC_ORIGIN:origin,VEYRA_PUBLIC_WALLET_PROOF:'false',VEYRA_RELATIONSHIP_DB:enabled?join(dir,'relationships.sqlite'):'',
  VEYRA_ENABLE_PRIVATE_RELATIONSHIPS:String(publicMode&&enabled),VEYRA_RELATIONSHIP_STORAGE_REVIEWED:'true',
  VEYRA_HISTORY_FILE:join(dir,'history.jsonl'),MEMWAL_PRIVATE_KEY:'',MEMWAL_ACCOUNT_ID:'',TATUM_API_KEY:'',SUI_PROTO_DIR:''};
 let child=spawn(process.execPath,['--experimental-strip-types','scripts/preflight-api.mjs'],{cwd:process.cwd(),env,stdio:'ignore'});
 async function stop(){if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit')}}
 t.after(async()=>{await stop();await rm(dir,{recursive:true,force:true})});
 async function ready(){for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error('API exited');try{if((await fetch(base+'/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,75))}throw Error('API not ready')}
 await ready();
 return{base,origin,dir,restart:async()=>{await stop();child=spawn(process.execPath,['--experimental-strip-types','scripts/preflight-api.mjs'],{cwd:process.cwd(),env,stdio:'ignore'});await ready();}};
}
function client(base:string,origin:string){
 const jar=new Map<string,string>();let csrf='';
 const call=async(path:string,data?:unknown,overrides:Record<string,string>={})=>{
  const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'content-type':'application/json',origin}),cookie:[...jar].map(([k,v])=>k+'='+v).join(';'),...(csrf?{'x-veyra-csrf':csrf}:{}),...overrides},...(data===undefined?{}:{body:JSON.stringify(data)})});
  for(const value of response.headers.getSetCookie()){const[k,v]=value.split(';')[0].split('=');if(v)jar.set(k,v);else jar.delete(k);}
  const body=await response.json();if(body.csrfToken)csrf=body.csrfToken;return{response,body};
 };
 const login=async(key=Ed25519Keypair.generate())=>{
  const challenge=await call('/v1/private/login-challenge',{address:key.toSuiAddress()});assert.equal(challenge.response.status,200);
  const signed=await key.signPersonalMessage(new TextEncoder().encode(challenge.body.message));
  const result=await call('/v1/private/login',{nonce:challenge.body.nonce,signature:signed.signature});assert.equal(result.response.status,200);return{key,result};
 };
 return{call,login,jar};
}

test('M3/M4: real HTTP wallet sessions, private invitation, trusted-channel acceptance and scoped preflight', {timeout:20000},async t=>{
 const api=await launch(t),payer=client(api.base,api.origin),recipient=client(api.base,api.origin),stranger=client(api.base,api.origin);
 const p=await payer.login(),r=await recipient.login();await stranger.login();
 const invitation=await payer.call('/v1/private/invitations',{label:'Private name never sent to providers'});assert.equal(invitation.response.status,201);
 assert.equal(new URL(invitation.body.invitationUrl).search,'');
 const bearer=new URLSearchParams(new URL(invitation.body.invitationUrl).hash.slice(1)).get('invite');
 const prepared=await recipient.call('/v1/private/recipient-prepare',{token:bearer});assert.equal(prepared.response.status,200);
 assert.ok(!JSON.stringify(prepared.body).includes('Private name never'));
 const signed=await r.key.signPersonalMessage(new TextEncoder().encode(prepared.body.message));
 const claim=await recipient.call('/v1/private/recipient-confirm',{nonce:prepared.body.nonce,signature:signed.signature});assert.equal(claim.response.status,200);
 const rel=claim.body.relationshipId;
 const before=await payer.call('/v1/private/relationships');assert.equal(before.body.relationships[0].acceptedAddress,null);
 assert.ok(!JSON.stringify(before.body).includes(claim.body.verificationCode));
 const acceptance={relationshipId:rel,claimId:claim.body.claimId,code:claim.body.verificationCode,expectedAddress:r.key.toSuiAddress(),method:'established_chat',independentlyConfirmed:true};
 assert.equal((await stranger.call('/v1/private/accept',acceptance)).response.status,404);
 assert.equal((await payer.call('/v1/private/accept',acceptance,{'x-veyra-csrf':'wrong'})).response.status,403);
 assert.equal((await payer.call('/v1/private/accept',acceptance,{origin:'https://evil.example'})).response.status,403);
 const accepted=await payer.call('/v1/private/accept',acceptance);assert.equal(accepted.response.status,200);assert.equal(accepted.body.identityVerified,false);
 const payload={relationshipId:rel,counterpartyId:'not-the-private-label',proposedAddress:r.key.toSuiAddress()};
 const preflight=await payer.call('/v1/preflight',payload);assert.equal(preflight.response.status,200);
 assert.equal(preflight.body.relationshipComparison.status,'matches_relationship_confirmation');assert.equal(preflight.body.conclusion.status,'matches_relationship_confirmation');assert.equal(preflight.body.walrusEvidenceConclusion.status,'no_evidence');assert.equal(preflight.body.paymentAuthorized,false);
 assert.equal(preflight.body.relationshipComparison.memoryWritten,false);assert.equal(preflight.body.providers.walrus,'unavailable');
 assert.equal(preflight.body.historyPersisted,false);
 await assert.rejects(readFile(join(api.dir,'history.jsonl'),'utf8'),{code:'ENOENT'});
 assert.equal((await stranger.call('/v1/preflight',payload)).response.status,404);
 const anonymous=client(api.base,api.origin);assert.equal((await anonymous.call('/v1/preflight',payload)).response.status,401);
 const changed=await payer.call('/v1/preflight',{...payload,proposedAddress:'0x2'});assert.equal(changed.body.relationshipComparison.status,'differs_from_relationship_confirmation');
 await api.restart();
 const restored=await payer.call('/v1/private/session');assert.equal(restored.response.status,200);assert.equal(restored.body.address,p.key.toSuiAddress());
 const contacts=await payer.call('/v1/private/relationships');assert.equal(contacts.body.relationships[0].acceptedAddress,r.key.toSuiAddress());
 const received=await recipient.call('/v1/private/recipient-confirmations');assert.equal(received.body.confirmations[0].verificationCode,claim.body.verificationCode);
 await payer.call('/v1/private/logout',{});assert.equal((await payer.call('/v1/private/relationships')).response.status,401);
});
test('M3: public HTTPS cookies, origin checks and publication lock remain separate', {timeout:15000},async t=>{
 const api=await launch(t,true),payer=client(api.base,api.origin);
 assert.equal((await payer.call('/v1/private/login-challenge',{address:'0x1'},{origin:'https://wrong.example'})).response.status,403);
 const{result}=await payer.login();const cookies=result.response.headers.getSetCookie();
 assert.ok(cookies.some(c=>c.startsWith('__Host-veyra-session=')&&c.includes('HttpOnly')&&c.includes('SameSite=Strict')&&c.includes('; Secure')));
 const health=await fetch(api.base+'/health').then(r=>r.json());assert.equal(health.privateRelationshipsEnabled,true);assert.equal(health.memoryWritesEnabled,false);
 assert.equal((await payer.call('/v1/self-service/confirm-and-store',{})).response.status,403);
 assert.equal((await payer.call('/v1/self-service/prepare-consent',{})).response.status,403);
});
test('M3: unconfigured private storage fails closed while public address checks remain intact', {timeout:15000},async t=>{
 const api=await launch(t,false,false),payer=client(api.base,api.origin);
 assert.equal((await payer.call('/v1/private/login-challenge',{address:'0x1'})).response.status,503);
 const health=await fetch(api.base+'/health').then(r=>r.json());assert.equal(health.privateRelationshipsEnabled,false);
 const publicCheck=await payer.call('/v1/preflight',{counterpartyId:'public-check',proposedAddress:'0x1'});
 assert.equal(publicCheck.response.status,200);assert.equal(publicCheck.body.relationshipComparison,null);
 const script=await fetch(api.base+'/relationships.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type')||'',/javascript/);
 const html=await fetch(api.base+'/').then(r=>r.text());assert.match(html,/relationships\.js/);
});
