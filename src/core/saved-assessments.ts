import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { RelationshipDatabase } from './relationship-database.ts';
import { normalizeSuiAddress } from './recipient-check.ts';
export class SavedAssessmentError extends Error { status:number;constructor(status:number,message:string){super(message);this.status=status;} }
const need=(ok:unknown,status:number,message:string):void=>{if(!ok)throw new SavedAssessmentError(status,message);};
const secret=()=>randomBytes(32).toString('base64url');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const validToken=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s);
const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const SESSION_MS=180*86400000;
const POLICY={version:1,perBrowserDaily:3,globalDaily:20,total:100};
export type AssessmentMemory={type:'veyra.assessment_memory.v1';chain:'sui';network:'mainnet';assessmentId:string;checkedAt:string;proposedAddress:string;conclusion:string;action:'manual_review_required';evidenceBlobIds:string[];tatum:{status:string;transactionDigest:string|null};recipientConfirmed:false;identityVerified:false;paymentAuthorized:false};
export type BrowserSession={id:string;csrf:string;expiresAt:number;credentialHash:string};
export type SavedJob={id:string;assessmentId:string;record:AssessmentMemory;recordHash:string;phase:string;providerJobId:string|null;blobId:string|null;verification:string;createdAt:number;storedAt:number|null;label:string};
/** Anonymous browser authentication is access to saved assessments, never authority over the checked wallet. */
export class SavedAssessments {
 private key='';
 private db:RelationshipDatabase;private origin:string;
 private constructor(db:RelationshipDatabase,origin:string){this.db=db;this.origin=origin;}
 static async attach(db:RelationshipDatabase,origin:string){
  need(new URL(origin).origin===origin,503,'Explicit memory origin required');
  const store=new SavedAssessments(db,origin);await store.init();return store;
 }
 private async init(){await this.db.transaction(async()=>{
  if(this.db.kind==='postgres')await this.db.exec('CREATE SCHEMA IF NOT EXISTS veyra_assessments');
  await this.db.exec(`CREATE TABLE IF NOT EXISTS asm_settings(k TEXT PRIMARY KEY,v TEXT NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS asm_sessions(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL,created INTEGER NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS asm_drafts(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES asm_sessions(id),assessment_id TEXT NOT NULL,record TEXT NOT NULL,record_hash TEXT NOT NULL,label TEXT NOT NULL,expires INTEGER NOT NULL,created INTEGER NOT NULL,UNIQUE(session_id,assessment_id)) STRICT;
   CREATE TABLE IF NOT EXISTS asm_jobs(id TEXT PRIMARY KEY REFERENCES asm_drafts(id),phase TEXT NOT NULL,provider_job TEXT,blob_id TEXT,verification TEXT NOT NULL,consent_hash TEXT NOT NULL,consent_at INTEGER NOT NULL,created INTEGER NOT NULL,stored INTEGER) STRICT;
   CREATE TABLE IF NOT EXISTS asm_limits(k TEXT PRIMARY KEY,start INTEGER NOT NULL,n INTEGER NOT NULL) STRICT;`);
  await this.db.prepare("INSERT OR IGNORE INTO asm_settings VALUES('key',?)").run(secret());
  await this.db.prepare("INSERT OR IGNORE INTO asm_settings VALUES('policy',?)").run(JSON.stringify(POLICY));
  need((await this.db.prepare("SELECT v FROM asm_settings WHERE k='policy'").get())?.v===JSON.stringify(POLICY),503,'Saved memory budget policy differs across instances');
  await this.db.prepare("INSERT OR IGNORE INTO asm_settings VALUES('origin',?)").run(this.origin);
  need((await this.db.prepare("SELECT v FROM asm_settings WHERE k='origin'").get())?.v===this.origin,503,'Saved memory origin differs across instances');
  this.key=String((await this.db.prepare("SELECT v FROM asm_settings WHERE k='key'").get())!.v);
 });}
 private mac(value:string){return createHmac('sha256',this.key).update(value).digest('base64url');}
 private async limit(k:string,max:number,now:number,period=86400000){
  const r=await this.db.prepare('SELECT * FROM asm_limits WHERE k=?').get(k);
  if(!r||now-Number(r.start)>=period)await this.db.prepare('INSERT INTO asm_limits(k,start,n) VALUES(?,?,1) ON CONFLICT(k) DO UPDATE SET start=excluded.start,n=excluded.n').run(k,now);
  else {need(Number(r.n)<max,429,'Saved memory request limit reached');await this.db.prepare('UPDATE asm_limits SET n=n+1 WHERE k=?').run(k);}
 }
 async session(raw?:string,now=Date.now()):Promise<BrowserSession|null>{
  if(!validToken(raw))return null;
  const row=await this.db.prepare('SELECT id,expires FROM asm_sessions WHERE token_hash=? AND expires>?').get(hash(raw),now);
  return row?{id:String(row.id),credentialHash:hash(raw),expiresAt:Number(row.expires),csrf:this.mac('csrf:'+raw+':'+this.origin)}:null;
 }
 async createSession(now=Date.now()){
  const raw=secret(),id=randomUUID();await this.db.transaction(async()=>{
   await this.db.prepare('DELETE FROM asm_drafts WHERE expires<=? AND id NOT IN (SELECT id FROM asm_jobs)').run(now);
   await this.db.prepare('DELETE FROM asm_sessions WHERE expires<=? AND id NOT IN (SELECT session_id FROM asm_drafts)').run(now);
   await this.limit('sessions',500,now); // Bound durable allocation; not just an in-memory IP limit.
   await this.db.prepare('INSERT INTO asm_sessions(id,token_hash,expires,created) VALUES(?,?,?,?)').run(id,hash(raw),now+SESSION_MS,now);
  });return {raw,session:(await this.session(raw,now))!};
 }
 checkCsrf(s:BrowserSession,value:unknown){need(typeof value==='string'&&equal(s.csrf,value),403,'Valid same-browser consent token required');}
 private async live(s:BrowserSession,now:number){need(await this.db.prepare('SELECT id FROM asm_sessions WHERE id=? AND token_hash=? AND expires>?').get(s.id,s.credentialHash,now),401,'Saved memory browser access expired');}
 /** The service attests only that it performed this assessment. No caller JSON is accepted as an assessment. */
 ticket(input:{assessmentId:string;checkedAt:string;counterpartyId:string;proposedAddress:string;conclusion:string;evidenceBlobIds:string[];tatumStatus:string;transactionDigest?:string|null},now=Date.now()){
  need(/^[a-f0-9-]{36}$/.test(input.assessmentId)&&Number.isFinite(Date.parse(input.checkedAt)),400,'Invalid server assessment');
  const record:AssessmentMemory={type:'veyra.assessment_memory.v1',chain:'sui',network:'mainnet',assessmentId:input.assessmentId,checkedAt:input.checkedAt,proposedAddress:normalizeSuiAddress(input.proposedAddress),conclusion:input.conclusion,action:'manual_review_required',evidenceBlobIds:[...new Set(input.evidenceBlobIds)].slice(0,20),tatum:{status:input.tatumStatus,transactionDigest:input.transactionDigest||null},recipientConfirmed:false,identityVerified:false,paymentAuthorized:false};
  const body=Buffer.from(JSON.stringify({record,label:input.counterpartyId,origin:this.origin,expires:now+15*60000})).toString('base64url');
  return body+'.'+this.mac('assessment:'+body);
 }
 async prepare(session:BrowserSession,ticket:unknown,now=Date.now()){
  need(typeof ticket==='string'&&ticket.length<12000,400,'Run a fresh check before saving');
  const [encoded,signature,...rest]=(ticket as string).split('.');
  need(!rest.length&&validToken(signature)&&equal(this.mac('assessment:'+encoded),signature),400,'Assessment ticket is invalid');
  let payload:any;try{payload=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));}catch{throw new SavedAssessmentError(400,'Invalid assessment ticket');}
  need(payload.origin===this.origin&&payload.expires>now&&payload.expires<=now+15*60000,409,'Assessment expired; run a fresh check');
  const record=payload.record as AssessmentMemory,recordJson=JSON.stringify(record),recordHash=hash(recordJson);
  need(record.type==='veyra.assessment_memory.v1'&&record.paymentAuthorized===false&&record.recipientConfirmed===false,400,'Assessment scope mismatch');
  return this.db.transaction(async()=>{
   await this.live(session,now);await this.limit('prepare:'+session.id,10,now,60000);
   const old=await this.db.prepare('SELECT id FROM asm_drafts WHERE session_id=? AND assessment_id=?').get(session.id,record.assessmentId);
   if(old){const existing=await this.get(session,String(old.id));if(existing?.phase!=='prepared')return existing;await this.db.prepare('UPDATE asm_drafts SET expires=? WHERE id=?').run(now+10*60000,old.id);return this.get(session,String(old.id));}
   // Purge only expired, never-submitted drafts. Receipt/recovery rows remain intact.
   await this.db.prepare('DELETE FROM asm_drafts WHERE expires<=? AND id NOT IN (SELECT id FROM asm_jobs)').run(now);
   const count=await this.db.prepare('SELECT count(*) AS n FROM asm_drafts WHERE session_id=?').get(session.id);
   const total=await this.db.prepare('SELECT count(*) AS n FROM asm_drafts').get();
   need(Number(count?.n)<50&&Number(total?.n)<1000,429,'Saved assessment capacity reached');
   const id=randomUUID();await this.db.prepare('INSERT INTO asm_drafts(id,session_id,assessment_id,record,record_hash,label,expires,created) VALUES(?,?,?,?,?,?,?,?)').run(id,session.id,record.assessmentId,recordJson,recordHash,String(payload.label).slice(0,128),now+10*60000,now);
   return this.get(session,id);
  });
 }
 async get(session:BrowserSession,id:unknown):Promise<SavedJob|null>{
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return null;
  const r=await this.db.prepare('SELECT d.*,j.phase,j.provider_job,j.blob_id,j.verification,j.stored FROM asm_drafts d LEFT JOIN asm_jobs j ON j.id=d.id WHERE d.id=? AND d.session_id=?').get(id,session.id);
  if(!r)return null;
  return {id:String(r.id),assessmentId:String(r.assessment_id),record:JSON.parse(String(r.record)),recordHash:String(r.record_hash),phase:r.phase?String(r.phase):'prepared',providerJobId:r.provider_job?String(r.provider_job):null,blobId:r.blob_id?String(r.blob_id):null,verification:r.verification?String(r.verification):'not_performed',createdAt:Number(r.created),storedAt:r.stored?Number(r.stored):null,label:String(r.label)};
 }
 async reserve(session:BrowserSession,id:unknown,recordHash:unknown,consent:unknown,now=Date.now()){
  return this.db.transaction(async()=>{
   await this.live(session,now);const job=await this.get(session,id);need(job,404,'Saved assessment not found');
   need(consent==='SAVE_ASSESSMENT_TO_WALRUS'&&recordHash===job!.recordHash,400,'Review and approve the exact assessment');
   if(job!.phase!=='prepared')return {created:false,job:job!};
   const draft=await this.db.prepare('SELECT expires FROM asm_drafts WHERE id=?').get(id);
   need(Number(draft?.expires)>now,409,'Save consent expired; review again');
   const total=await this.db.prepare('SELECT count(*) AS n FROM asm_jobs').get();
   need(Number(total?.n)<POLICY.total,429,'Service saved-memory allowance reached');
   await this.limit('writes:'+session.id,POLICY.perBrowserDaily,now);await this.limit('writes-global',POLICY.globalDaily,now);
   // Capacity remains consumed on uncertain provider acceptance; no blind retries.
   await this.db.prepare("INSERT INTO asm_jobs(id,phase,verification,consent_hash,consent_at,created) VALUES(?,'submitting','not_performed',?,?,?)").run(id,hash(JSON.stringify({origin:this.origin,id,recordHash,session:session.id,scope:'assessment_only',disclosureVersion:1,consent})),now,now);
   return {created:true,job:(await this.get(session,String(id)))!};
  });
 }
 async accept(id:string,providerJobId:string){need(typeof providerJobId==='string'&&providerJobId.length>0&&providerJobId.length<=256,503,'Provider did not accept storage');await this.db.prepare("UPDATE asm_jobs SET phase='pending',provider_job=? WHERE id=? AND phase='submitting'").run(providerJobId,id);}
 async uncertain(id:string){await this.db.prepare("UPDATE asm_jobs SET phase='uncertain' WHERE id=? AND phase='submitting'").run(id);}
 async complete(id:string,providerJobId:string,blobId:string,now=Date.now()){
  need(/^[A-Za-z0-9_-]{1,256}$/.test(blobId),503,'Completed provider blob required');
  await this.db.transaction(async()=>{
   const job=await this.db.prepare('SELECT * FROM asm_jobs WHERE id=?').get(id);need(job&&job.provider_job===providerJobId,409,'Provider job mismatch');
   need(!job?.blob_id||job.blob_id===blobId,409,'Conflicting completion receipt');
   await this.db.prepare("UPDATE asm_jobs SET phase='stored',blob_id=?,stored=COALESCE(stored,?) WHERE id=?").run(blobId,now,id);
  });
 }
 async recordRecall(session:BrowserSession,id:string,response:{results?:{blob_id:string;text:string}[]}){
  const job=await this.get(session,id);need(job?.phase==='stored'&&job.blobId,409,'Storage must complete before recall');
  const matches=(response.results||[]).filter(r=>r.blob_id===job!.blobId);
  const verified=matches.some(r=>typeof r.text==='string'&&hash(r.text)===job!.recordHash);
  const state=verified?'verified_via_memwal_recall':matches.length?'recall_hash_mismatch':'not_found_in_recall';
  await this.db.prepare('UPDATE asm_jobs SET verification=? WHERE id=?').run(state,id);
  return {status:state,blobId:job!.blobId,recordHash:job!.recordHash,payloadHashVerifiedViaRelayer:verified,independentExactDecryption:false,paymentAuthorized:false};
 }
 async list(session:BrowserSession,now=Date.now()){
  await this.live(session,now);
  const ids=await this.db.prepare('SELECT d.id FROM asm_drafts d JOIN asm_jobs j ON j.id=d.id WHERE d.session_id=? ORDER BY d.created DESC LIMIT 50').all(session.id);
  return Promise.all(ids.map(r=>this.get(session,String(r.id))));
 }
 async recoveryCode(session:BrowserSession,now=Date.now()){
  await this.live(session,now);const row=await this.db.prepare('SELECT token_hash FROM asm_sessions WHERE id=?').get(session.id);
  return session.id+'.'+this.mac('recover:'+session.id+':'+row!.token_hash);
 }
 async restore(code:unknown,now=Date.now()){
  need(typeof code==='string'&&code.length<100,400,'Valid recovery code required');
  const [id,signature,...rest]=(code as string).trim().split('.');
  need(!rest.length&&/^[a-f0-9-]{36}$/.test(id)&&validToken(signature),400,'Valid recovery code required');
  const raw=secret();
  await this.db.transaction(async()=>{
   await this.limit('restore-global',100,now);
   const row=await this.db.prepare('SELECT * FROM asm_sessions WHERE id=? AND expires>?').get(id,now);
   need(row&&equal(this.mac('recover:'+id+':'+row.token_hash),signature),401,'Recovery code expired or already used');
   // Recovery rotates browser access and invalidates the old cookie and recovery code.
   await this.db.prepare('UPDATE asm_sessions SET token_hash=?,expires=? WHERE id=?').run(hash(raw),now+SESSION_MS,id);
  });return {raw,session:(await this.session(raw,now))!};
 }
 async fail(id:string){await this.db.prepare("UPDATE asm_jobs SET phase='failed' WHERE id=? AND phase='pending'").run(id);}
 async readPermit(session:BrowserSession,now=Date.now()){await this.db.transaction(async()=>{await this.live(session,now);await this.limit('reads:'+session.id,8,now,60000);await this.limit('reads-global',60,now,60000);});}
}
