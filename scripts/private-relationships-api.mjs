// Private local relationship state only. No Walrus publication or payment.
import { RecipientRelationships, RelationshipError } from '../src/core/recipient-relationships.ts';
import { PublicationLedger } from '../src/core/publication-ledger.ts';
import { isAbsolute } from 'node:path';

export async function createPrivateRelationshipsApi({publicMode,port,requestAllowed,readPublicationReadiness,readPublicationReceipt}) {
  const databaseUrl=process.env.DATABASE_URL;
  const configuredPath=process.env.VEYRA_RELATIONSHIP_DB;
  const origin=publicMode?process.env.VEYRA_PUBLIC_ORIGIN:`http://127.0.0.1:${port}`;
  if(databaseUrl&&configuredPath)throw new Error('Configure only one private relationship storage backend');
  if(publicMode&&(configuredPath||databaseUrl)&&process.env.VEYRA_ENABLE_PRIVATE_RELATIONSHIPS==='true'){
    if(process.env.VEYRA_RELATIONSHIP_STORAGE_REVIEWED!=='true'||(configuredPath&&!isAbsolute(configuredPath)))
      throw new Error('Private relationships require a reviewed persistent private storage');
    if(!origin||!/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(origin)||origin.includes('..'))
      throw new Error('Private relationships require an explicit HTTPS origin');
  }
  const enabled=Boolean((configuredPath||databaseUrl)&&(!publicMode||process.env.VEYRA_ENABLE_PRIVATE_RELATIONSHIPS==='true'));
  const store=enabled?(databaseUrl?await RecipientRelationships.connect(databaseUrl,origin,!publicMode):await RecipientRelationships.open(configuredPath,origin)):null;
  // Hosted publication staging is durable, but its spending policy starts at zero.
  const publicationLedger=store?await PublicationLedger.attach(store.storageDriver(),{maxDailyWritesPerWallet:0,maxGlobalDailyWrites:0,maxTotalWrites:0}):null;
  const sessionName=publicMode?'__Host-veyra-session':'veyra-session';
  const bindingName=publicMode?'__Host-veyra-binding':'veyra-binding';
  const cookie=(name,value,seconds)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${publicMode?'; Secure':''}`;
  function readCookie(req,name){
    const values=(req.headers.cookie||'').split(';').map(c=>c.trim()).filter(c=>c.startsWith(name+'='));
    return values.length===1?values[0].slice(name.length+1):undefined;
  }
  async function session(req){return store?await store.authenticate(readCookie(req,sessionName)):null;}
  async function requireSession(req){const current=await session(req);if(!current)throw new RelationshipError(401,'Sign in with your wallet to access private contacts');return current;}
  async function body(req){
    if(!req.headers['content-type']?.toLowerCase().startsWith('application/json'))throw new RelationshipError(415,'JSON required');
    let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>8192)throw new RelationshipError(413,'Request too large');}
    let data;try{data=JSON.parse(raw)}catch{throw new RelationshipError(400,'Invalid JSON')}
    if(!data||typeof data!=='object'||Array.isArray(data))throw new RelationshipError(400,'JSON object required');return data;
  }
  async function relationshipPreflight(req,relationshipId,proposedAddress){
    if(!store)throw new RelationshipError(503,'Private contacts are not configured on this deployment');
    if(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')throw new RelationshipError(403,'Exact same-site origin required');
    try{const current=await requireSession(req);store.checkCsrf(current,req.headers['x-veyra-csrf']);return await store.assess(current,relationshipId,proposedAddress);}catch(error){if(error instanceof RelationshipError)throw error;throw new RelationshipError(503,'Private storage temporarily unavailable; try again');}
  }
  async function handle(req,res){
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/v1/private/'))return false;
    const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Cookie','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(JSON.stringify({...data,paymentAuthorized:false,memoryWritten:false}));return true;};
    if(!store)return send(503,{error:'Private contacts require reviewed persistent storage; they are disabled on this deployment'});
    try{
      if(req.headers['sec-fetch-site']==='cross-site')throw new RelationshipError(403,'Cross-site private contact access forbidden');
      if(req.method==='POST'&&req.headers.origin!==origin)throw new RelationshipError(403,'Exact same-site origin required');
      if(!requestAllowed(req.socket.remoteAddress))throw new RelationshipError(429,'Private request limit reached');
      if(req.method==='GET'&&url.pathname==='/v1/private/session'){
        const current=await requireSession(req);return send(200,{address:current.address,expiresAt:current.expiresAt,csrfToken:current.csrfToken});
      }
      if(req.method==='POST'&&url.pathname==='/v1/private/login-challenge'){
        const input=await body(req);if(typeof input.address!=='string')throw new RelationshipError(400,'Wallet address required');
        const challenge=await store.issueLogin(input.address);
        res.setHeader('set-cookie',cookie(bindingName,challenge.binding,300));
        const {binding,...publicChallenge}=challenge;return send(200,publicChallenge);
      }
      if(req.method==='POST'&&url.pathname==='/v1/private/login'){
        const input=await body(req);
        const result=await store.completeLogin(input.nonce,readCookie(req,bindingName),input.signature,readCookie(req,sessionName));
        res.setHeader('set-cookie',[cookie(sessionName,result.rawToken,3600),cookie(bindingName,'',0)]);
        const {sessionHash,...publicSession}=result.session;return send(200,publicSession);
      }
      const current=await requireSession(req);
      if(req.method==='POST')store.checkCsrf(current,req.headers['x-veyra-csrf']);
      if(req.method==='GET'&&url.pathname==='/v1/private/publication-readiness')return send(200,{readiness:await readPublicationReadiness(),publicationEnabled:false});
      if(req.method==='POST'&&url.pathname==='/v1/private/publication-prepare'){
        const input=await body(req);
        const prepared=await store.storageDriver().transaction(async()=>{
          const context=await store.publicationContext(current,input.relationshipId);
          return publicationLedger.issue(context.address,context.relationshipId,Date.now(),{origin:context.origin,sessionHash:context.sessionHash});
        });
        return send(200,{status:'consent_prepared_publication_locked',consentPayload:prepared.consentPayload,
          consentMessage:prepared.consentMessage,candidateRecord:prepared.candidate,recordHash:prepared.recordHash,
          publicationEnabled:false,limitation:'Review only. Public writes remain disabled; no signature or storage submission was requested.'});
      }
      if(req.method==='POST'&&url.pathname==='/v1/private/publication-review'){
        const input=await body(req);
        const prepared=await store.storageDriver().transaction(async()=>{
          const record=await publicationLedger.get(input.consent,Date.now(),{origin,sessionHash:current.sessionHash});
          if(!record)throw new RelationshipError(404,'Publication preparation unavailable for this browser session');
          const context=await store.publicationContext(current,record.candidate.counterpartyId,Date.now(),{consumePreparationQuota:false});
          if(context.address!==record.candidate.address)throw new RelationshipError(404,'Receiving confirmation is no longer current');
          return record;
        });
        return send(200,{candidateRecord:prepared.candidate,consentPayload:prepared.consentPayload,consentMessage:prepared.consentMessage,recordHash:prepared.recordHash,publicationEnabled:false});
      }
      if(req.method==='GET'&&url.pathname==='/v1/private/publication-receipts')
        return send(200,{receipts:await publicationLedger.getReceiptsForWallet(current.address)});
      if(req.method==='POST'&&url.pathname==='/v1/private/publication-verify'){
        const input=await body(req);const job=typeof input.nonce==='string'?await publicationLedger.getJob(input.nonce):null;
        if(!job?.receipt||job.address!==current.address)throw new RelationshipError(404,'Completed publication not found');
        const verification=await readPublicationReceipt(job.receipt);await publicationLedger.recordVerification(job.nonce,verification);
        return send(200,{receipt:job.receipt,exactVerification:verification,publicationEnabled:false});
      }
      if(req.method==='GET'&&url.pathname==='/v1/private/publication-job'){
        const nonce=url.searchParams.get('nonce');
        if(typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce))throw new RelationshipError(400,'Valid publication nonce required');
        const job=await publicationLedger.getJob(nonce);
        if(!job||job.address!==current.address)throw new RelationshipError(404,'Publication job not found');
        return send(200,{job,exactVerification:await publicationLedger.getVerification(nonce),publicationEnabled:false});
      }
      if(req.method==='POST'&&url.pathname==='/v1/private/logout'){
        await store.logout(current);res.setHeader('set-cookie',cookie(sessionName,'',0));return send(200,{status:'signed_out'});
      }
      if(req.method==='GET'&&url.pathname==='/v1/private/recipient-confirmations')return send(200,{confirmations:await store.received(current)});
      if(req.method==='GET'&&url.pathname==='/v1/private/export')return send(200,await store.exportContacts(current));
      if(req.method==='POST'&&url.pathname==='/v1/private/delete-contact'){
        const input=await body(req);const deleted=await store.storageDriver().transaction(async()=>{const result=await store.deleteContact(current,input.relationshipId,input.confirmLabel);await publicationLedger.deleteUnsubmittedForRelationship(input.relationshipId);return result;});return send(200,deleted);
      }
      if(req.method==='GET'&&url.pathname==='/v1/private/relationships')return send(200,{relationships:await store.list(current)});
      if(req.method==='GET'&&url.pathname==='/v1/private/relationship-history')
        return send(200,{events:await store.history(current,url.searchParams.get('relationshipId'))});
      if(req.method==='POST'&&url.pathname==='/v1/private/invitations')return send(201,await store.createInvitation(current,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/private/recipient-prepare'){
        const input=await body(req);return send(200,await store.prepareRecipient(current,input.token));
      }
      if(req.method==='POST'&&url.pathname==='/v1/private/recipient-confirm'){
        const input=await body(req);return send(200,await store.confirmRecipient(current,input.nonce,input.signature));
      }
      if(req.method==='POST'&&url.pathname==='/v1/private/accept')return send(200,await store.accept(current,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/private/revoke'){
        const input=await body(req);
        const revoked=await store.storageDriver().transaction(async()=>{
          const result=await store.revoke(current,input.relationshipId);
          await publicationLedger.deleteUnsubmittedForRelationship(input.relationshipId);
          return result;
        });
        return send(200,revoked);
      }
      return send(404,{error:'Private route not found'});
    }catch(error){
      return send(error instanceof RelationshipError?error.status:503,{error:error instanceof RelationshipError?error.message:'Private request could not be completed'});
    }
  }
  return {enabled,publicationLedger,storage:enabled?(databaseUrl?'postgres':'sqlite'):null,handle,relationshipPreflight,close:async()=>{await store?.close();}};
}
