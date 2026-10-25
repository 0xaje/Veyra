import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RecipientRelationships } from '../src/core/recipient-relationships.ts';
import { SavedAssessments } from '../src/core/saved-assessments.ts';
import { postgresFixture } from './relationship-storage-fixtures.ts';

// Database/cryptographic lifecycle fixtures only. No provider responses or Mainnet writes are fabricated.
for(const backend of ['sqlite',...(process.env.TEST_DATABASE_URL?['postgres']:[])]){
 async function setup(t:any){
  const directory=await mkdtemp(join(tmpdir(),'veyra-saved-check-')),pg=backend==='postgres'?await postgresFixture():null;
  const open=()=>pg?RecipientRelationships.connect(pg.url,'http://127.0.0.1:8787',true):RecipientRelationships.open(join(directory,'private.sqlite'),'http://127.0.0.1:8787');
  let relationships=await open(),store=await SavedAssessments.attach(relationships.storageDriver(),'http://127.0.0.1:8787');
  t.after(async()=>{await relationships.close();await pg?.dispose();await rm(directory,{recursive:true,force:true});});
  return {get store(){return store;},async reopen(){await relationships.close();relationships=await open();store=await SavedAssessments.attach(relationships.storageDriver(),'http://127.0.0.1:8787');return store;}};
 }
 function ticket(store:SavedAssessments,now=Date.now()){
  return store.ticket({assessmentId:randomUUID(),checkedAt:new Date(now).toISOString(),counterpartyId:'Private fixture label',proposedAddress:'0x1',conclusion:'no_evidence',evidenceBlobIds:[],tatumStatus:'not_requested'},now);
 }
 test(backend+': saved check authenticates browser, binds exact record and isolates history',async t=>{
  const {store}=await setup(t),a=await store.createSession(),b=await store.createSession();
  assert.equal(await store.session(undefined),null);assert.equal(await store.session('invalid'),null);
  assert.throws(()=>store.checkCsrf(a.session,b.session.csrf));store.checkCsrf(a.session,a.session.csrf);
  const signed=ticket(store),job=(await store.prepare(a.session,signed))!;
  assert.equal(job.record.type,'veyra.assessment_memory.v1');assert.equal(job.record.recipientConfirmed,false);assert.equal(job.record.identityVerified,false);assert.equal(job.record.paymentAuthorized,false);
  assert.ok(!JSON.stringify(job.record).includes('Private fixture label'));assert.ok(!JSON.stringify(job.record).includes(a.raw));
  assert.equal(await store.get(b.session,job.id),null);
  await assert.rejects(store.reserve(b.session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS'));
  await assert.rejects(store.reserve(a.session,job.id,'0'.repeat(64),'SAVE_ASSESSMENT_TO_WALRUS'));
  await assert.rejects(store.reserve(a.session,job.id,job.recordHash,true));
  const reservations=await Promise.all([store.reserve(a.session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS'),store.reserve(a.session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS')]);
  assert.equal(reservations.filter(r=>r.created).length,1);
  assert.equal((await store.list(a.session)).length,1);assert.equal((await store.list(b.session)).length,0);
  assert.equal((await store.prepare(a.session,signed))!.id,job.id);
 });
 test(backend+': forged/expired assessment tickets and expired consent are rejected',async t=>{
  const {store}=await setup(t),a=await store.createSession(),now=Date.now(),signed=ticket(store,now);
  const [body,mac]=signed.split('.'),parsed=JSON.parse(Buffer.from(body,'base64url').toString());parsed.record.proposedAddress='0x2';
  await assert.rejects(store.prepare(a.session,Buffer.from(JSON.stringify(parsed)).toString('base64url')+'.'+mac));
  await assert.rejects(store.prepare(a.session,signed,now+15*60000+1));
  const job=(await store.prepare(a.session,signed,now))!;
  await assert.rejects(store.reserve(a.session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS',now+10*60000+1));
 });
 test(backend+': accepted job, exact bytes and anonymous access survive restart without resubmission',async t=>{
  const fixture=await setup(t),a=await fixture.store.createSession(),signed=ticket(fixture.store),job=(await fixture.store.prepare(a.session,signed))!;
  await fixture.store.reserve(a.session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS');
  await fixture.store.accept(job.id,'local-lifecycle-fixture-job');
  const reopened=await fixture.reopen(),session=(await reopened.session(a.raw))!;
  const restored=(await reopened.get(session,job.id))!;assert.equal(restored.phase,'pending');assert.deepEqual(restored.record,job.record);
  assert.equal((await reopened.reserve(session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS')).created,false);
  await assert.rejects(reopened.complete(job.id,'different-fixture-job','fixture-blob'));
  await reopened.complete(job.id,'local-lifecycle-fixture-job','fixture-blob');
  await assert.rejects(reopened.complete(job.id,'local-lifecycle-fixture-job','conflicting-fixture-blob'));
  const match=await reopened.recordRecall(session,job.id,{results:[{blob_id:'fixture-blob',text:JSON.stringify(job.record)}]});
  assert.equal(match.status,'verified_via_memwal_recall');assert.equal(match.independentExactDecryption,false);
  const altered=await reopened.recordRecall(session,job.id,{results:[{blob_id:'fixture-blob',text:JSON.stringify(job.record)+' '}]});assert.equal(altered.status,'recall_hash_mismatch');
  assert.equal((await reopened.recordRecall(session,job.id,{results:[]})).status,'not_found_in_recall');
 });
 test(backend+': recovery rotates access, preserves saved job and prevents old-cookie/recovery replay',async t=>{
  const {store}=await setup(t),a=await store.createSession(),job=(await store.prepare(a.session,ticket(store)))!;
  await store.reserve(a.session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS');
  const code=await store.recoveryCode(a.session),restored=await store.restore(code);
  assert.equal(await store.session(a.raw),null);assert.equal(restored.session.id,a.session.id);
  assert.equal((await store.get(restored.session,job.id))!.recordHash,job.recordHash);
  await assert.rejects(store.restore(code));await assert.rejects(store.list(a.session));
  const fresh=await store.recoveryCode(restored.session);assert.notEqual(fresh,code);
 });
 test(backend+': durable browser and global write ceilings cannot be reset by restart',async t=>{
  const fixture=await setup(t),now=Date.now(),a=await fixture.store.createSession(now);
  for(let i=0;i<3;i++){const job=(await fixture.store.prepare(a.session,ticket(fixture.store,now),now))!;await fixture.store.reserve(a.session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS',now);await fixture.store.uncertain(job.id);}
  const store=await fixture.reopen(),session=(await store.session(a.raw,now))!,fourth=(await store.prepare(session,ticket(store,now),now))!;
  await assert.rejects(store.reserve(session,fourth.id,fourth.recordHash,'SAVE_ASSESSMENT_TO_WALRUS',now));
  for(let i=0;i<17;i++){const b=await store.createSession(now),job=(await store.prepare(b.session,ticket(store,now),now))!;await store.reserve(b.session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS',now);}
  const b=await store.createSession(now),job=(await store.prepare(b.session,ticket(store,now),now))!;await assert.rejects(store.reserve(b.session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS',now));
 });
 test(backend+': service lifetime ceiling persists across browsers, daily rollover and reopen',async t=>{
  const fixture=await setup(t),base=Date.now();
  for(let i=0;i<100;i++){
   const now=base+Math.floor(i/20)*86400000,a=await fixture.store.createSession(now),job=(await fixture.store.prepare(a.session,ticket(fixture.store,now),now))!;
   await fixture.store.reserve(a.session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS',now);
  }
  const store=await fixture.reopen(),now=base+6*86400000,a=await store.createSession(now),job=(await store.prepare(a.session,ticket(store,now),now))!;
  await assert.rejects(store.reserve(a.session,job.id,job.recordHash,'SAVE_ASSESSMENT_TO_WALRUS',now));
 });

}
