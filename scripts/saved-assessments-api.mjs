import { SavedAssessments, SavedAssessmentError } from '../src/core/saved-assessments.ts';
import { MemWal } from '@mysten-incubation/memwal';

/** Saved checks are owner-isolated assessment history; never recipient baselines. */
export async function createSavedAssessmentsApi({db,origin,publicMode,requestAllowed}){
 const store=db?await SavedAssessments.attach(db,origin):null;
 const credentials=Boolean(process.env.MEMWAL_PRIVATE_KEY&&process.env.MEMWAL_ACCOUNT_ID);
 const enabled=Boolean(store&&credentials);
 const cookieName=publicMode?'__Host-veyra-memory':'veyra-memory';
 const client=()=>MemWal.create({key:process.env.MEMWAL_PRIVATE_KEY,accountId:process.env.MEMWAL_ACCOUNT_ID,
  serverUrl:process.env.MEMWAL_SERVER_URL||'https://relayer.memory.walrus.xyz',namespace:process.env.MEMWAL_NAMESPACE||'veyra-dev',requestTimeoutMs:12000,recallTimeoutMs:15000});
 const operations=new Map();let submitting=0;
 function rawCookie(req){const matches=(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='));return matches.length===1?matches[0].slice(cookieName.length+1):undefined;}
 async function body(req){
  if(!req.headers['content-type']?.toLowerCase().startsWith('application/json'))throw new SavedAssessmentError(415,'JSON required');
  let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>16000)throw new SavedAssessmentError(413,'Save request too large');}
  let input;try{input=JSON.parse(raw);}catch{throw new SavedAssessmentError(400,'Invalid JSON');}
  if(!input||typeof input!=='object'||Array.isArray(input))throw new SavedAssessmentError(400,'JSON object required');return input;
 }
 async function refresh(session,id){
  const job=await store.get(session,id);if(!job)throw new SavedAssessmentError(404,'Saved check not found');
  if(job.phase!=='pending'||!job.providerJobId)return job;
  if(operations.has(id))return operations.get(id);
  if(operations.size>=2)throw new SavedAssessmentError(429,'Storage status is busy; retry shortly');
  const task=(async()=>{
   try{const status=await client().getRememberStatus(job.providerJobId);
    if(status.job_id!==job.providerJobId)throw new Error('Provider job mismatch');
    if(status.status==='done'&&status.blob_id)await store.complete(id,job.providerJobId,status.blob_id);
    if(status.status==='failed')await store.fail(id);
    // A failed or unavailable job is not completed and is never resubmitted automatically.
   }catch{/* Return persisted pending state; a temporary provider outage must not invent failure/completion. */}
   return store.get(session,id);
  })().finally(()=>operations.delete(id));operations.set(id,task);return task;
 }
 async function handle(req,res){
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/v1/saved-checks'))return false;
  const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Cookie','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(JSON.stringify({...data,paymentAuthorized:false}));return true;};
  if(!store)return send(503,{error:'Persistent saved checks are unavailable on this deployment'});
  try{
   if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==origin)||(req.method==='POST'&&req.headers.origin!==origin))throw new SavedAssessmentError(403,'Exact same-site origin required');
   if(!requestAllowed(req.socket.remoteAddress))throw new SavedAssessmentError(429,'Saved check request limit reached');
   let session=await store.session(rawCookie(req));
   if(url.pathname==='/v1/saved-checks/session'&&req.method==='GET')return send(200,{available:enabled,exists:Boolean(session),csrfToken:session?.csrf||null,expiresAt:session?.expiresAt||null});
   if(url.pathname==='/v1/saved-checks/session'&&req.method==='POST'){
    await body(req);
    if(!enabled)throw new SavedAssessmentError(503,'Walrus saving is unavailable; the address checker still works');
    if(!session){const created=await store.createSession();session=created.session;
     res.setHeader('set-cookie',`${cookieName}=${created.raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=15552000${publicMode?'; Secure':''}`);}
    return send(200,{available:enabled,exists:true,csrfToken:session.csrf,expiresAt:session.expiresAt});
   }
   if(url.pathname==='/v1/saved-checks/restore'&&req.method==='POST'){
    const input=await body(req),restored=await store.restore(input.recoveryCode);
    res.setHeader('set-cookie',`${cookieName}=${restored.raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=15552000${publicMode?'; Secure':''}`);
    return send(200,{exists:true,csrfToken:restored.session.csrf,expiresAt:restored.session.expiresAt});
   }
   if(!session)throw new SavedAssessmentError(401,'Open saved checks in the browser where you saved them');
   if(req.method==='POST')store.checkCsrf(session,req.headers['x-veyra-memory-csrf']);
   if(url.pathname==='/v1/saved-checks/recovery-code'&&req.method==='POST'){
    await body(req);return send(200,{recoveryCode:await store.recoveryCode(session),warning:'Keep this code private. It grants access to your saved checks. Restoring rotates access and signs out the previous browser.'});
   }
   if(url.pathname==='/v1/saved-checks'&&req.method==='GET')return send(200,{records:await store.list(session),access:'this_browser',expiresAt:session.expiresAt});
   if(url.pathname==='/v1/saved-checks/prepare'&&req.method==='POST'){
    if(!enabled)throw new SavedAssessmentError(503,'Walrus saving is unavailable');
    const input=await body(req),job=await store.prepare(session,input.assessmentTicket);
    return send(200,{job,disclosure:'Saves the checked address, result, timestamp and evidence references to Walrus. It does not confirm recipient ownership or authorize payment. Your contact label and browser access token are not included in the Walrus record. Stored copies may outlive deletion or browser access; availability also depends on the storage lease.'});
   }
   if(url.pathname==='/v1/saved-checks/submit'&&req.method==='POST'){
    if(!enabled)throw new SavedAssessmentError(503,'Walrus saving is unavailable');
    const input=await body(req);
    if(submitting>=2)throw new SavedAssessmentError(429,'Storage is busy; retry this same save shortly');
    submitting++;
    try{
     const reserved=await store.reserve(session,input.id,input.recordHash,input.consent);
     if(!reserved.created)return send(reserved.job.phase==='stored'?200:202,{job:reserved.job,writeSubmitted:false});
     const job=reserved.job;
     try{
      const accepted=await client().remember(JSON.stringify(job.record),{idempotencyKey:'veyra-assessment-'+job.id});
      if(typeof accepted.job_id!=='string'||!accepted.job_id)throw new Error('No accepted job');
      await store.accept(job.id,accepted.job_id);
     }catch{await store.uncertain(job.id);}
     return send(202,{job:await store.get(session,job.id),writeSubmitted:true});
    }finally{submitting--;}
   }
   if(url.pathname==='/v1/saved-checks/status'&&req.method==='POST'){
    const input=await body(req);await store.readPermit(session);return send(200,{job:await refresh(session,input.id),writeSubmitted:false});
   }
   if(url.pathname==='/v1/saved-checks/recall'&&req.method==='POST'){
    const input=await body(req),job=await store.get(session,input.id);
    if(!job?.blobId||job.phase!=='stored')throw new SavedAssessmentError(409,'Wait for completed storage before recall');
    await store.readPermit(session);
    if(operations.size>=2)throw new SavedAssessmentError(429,'Memory recall is busy; retry shortly');
    const key='recall:'+job.id;if(operations.has(key))throw new SavedAssessmentError(429,'This memory is already being recalled');
    const task=client().recall({query:'Veyra assessment memory '+job.assessmentId,limit:20}).finally(()=>operations.delete(key));operations.set(key,task);
    let response;try{response=await task;}catch{return send(503,{error:'Walrus recall is temporarily unavailable; your stored receipt is retained',job,writeSubmitted:false});}
    return send(200,{verification:await store.recordRecall(session,job.id,response),job:await store.get(session,job.id),writeSubmitted:false});
   }
   return send(404,{error:'Saved check route not found'});
  }catch(error){return send(error instanceof SavedAssessmentError?error.status:503,{error:error instanceof SavedAssessmentError?error.message:'Saved check temporarily unavailable; retry without creating a new save'});}
 }
 return {enabled,store,handle};
}
