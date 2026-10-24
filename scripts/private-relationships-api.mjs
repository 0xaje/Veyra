// Private local relationship state only. No Walrus publication or payment.
import { RecipientRelationships, RelationshipError } from '../src/core/recipient-relationships.ts';
import { isAbsolute } from 'node:path';

export function createPrivateRelationshipsApi({publicMode,port,requestAllowed}) {
  const configuredPath=process.env.VEYRA_RELATIONSHIP_DB;
  const origin=publicMode?process.env.VEYRA_PUBLIC_ORIGIN:`http://127.0.0.1:${port}`;
  if(publicMode&&configuredPath&&process.env.VEYRA_ENABLE_PRIVATE_RELATIONSHIPS==='true'){
    if(process.env.VEYRA_RELATIONSHIP_STORAGE_REVIEWED!=='true'||!isAbsolute(configuredPath))
      throw new Error('Private relationships require a reviewed absolute persistent database path');
    if(!origin||!/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(origin)||origin.includes('..'))
      throw new Error('Private relationships require an explicit HTTPS origin');
  }
  const enabled=Boolean(configuredPath&&(!publicMode||process.env.VEYRA_ENABLE_PRIVATE_RELATIONSHIPS==='true'));
  const store=enabled?new RecipientRelationships(configuredPath,origin):null;
  const sessionName=publicMode?'__Host-veyra-session':'veyra-session';
  const bindingName=publicMode?'__Host-veyra-binding':'veyra-binding';
  const cookie=(name,value,seconds)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${publicMode?'; Secure':''}`;
  function readCookie(req,name){
    const values=(req.headers.cookie||'').split(';').map(c=>c.trim()).filter(c=>c.startsWith(name+'='));
    return values.length===1?values[0].slice(name.length+1):undefined;
  }
  function session(req){return store?.authenticate(readCookie(req,sessionName))||null;}
  function requireSession(req){const current=session(req);if(!current)throw new RelationshipError(401,'Sign in with your wallet to access private contacts');return current;}
  async function body(req){
    if(!req.headers['content-type']?.toLowerCase().startsWith('application/json'))throw new RelationshipError(415,'JSON required');
    let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>8192)throw new RelationshipError(413,'Request too large');}
    let data;try{data=JSON.parse(raw)}catch{throw new RelationshipError(400,'Invalid JSON')}
    if(!data||typeof data!=='object'||Array.isArray(data))throw new RelationshipError(400,'JSON object required');return data;
  }
  function relationshipPreflight(req,relationshipId,proposedAddress){
    if(!store)throw new RelationshipError(503,'Private contacts are not configured on this deployment');
    if(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')throw new RelationshipError(403,'Exact same-site origin required');
    const current=requireSession(req);store.checkCsrf(current,req.headers['x-veyra-csrf']);
    return store.assess(current,relationshipId,proposedAddress);
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
        const current=requireSession(req);return send(200,{address:current.address,expiresAt:current.expiresAt,csrfToken:current.csrfToken});
      }
      if(req.method==='POST'&&url.pathname==='/v1/private/login-challenge'){
        const input=await body(req);if(typeof input.address!=='string')throw new RelationshipError(400,'Wallet address required');
        const challenge=store.issueLogin(input.address);
        res.setHeader('set-cookie',cookie(bindingName,challenge.binding,300));
        const {binding,...publicChallenge}=challenge;return send(200,publicChallenge);
      }
      if(req.method==='POST'&&url.pathname==='/v1/private/login'){
        const input=await body(req);
        const result=await store.completeLogin(input.nonce,readCookie(req,bindingName),input.signature,readCookie(req,sessionName));
        res.setHeader('set-cookie',[cookie(sessionName,result.rawToken,3600),cookie(bindingName,'',0)]);
        const {sessionHash,...publicSession}=result.session;return send(200,publicSession);
      }
      const current=requireSession(req);
      if(req.method==='POST')store.checkCsrf(current,req.headers['x-veyra-csrf']);
      if(req.method==='POST'&&url.pathname==='/v1/private/logout'){
        store.logout(current);res.setHeader('set-cookie',cookie(sessionName,'',0));return send(200,{status:'signed_out'});
      }
      if(req.method==='GET'&&url.pathname==='/v1/private/recipient-confirmations')return send(200,{confirmations:store.received(current)});
      if(req.method==='GET'&&url.pathname==='/v1/private/relationships')return send(200,{relationships:store.list(current)});
      if(req.method==='GET'&&url.pathname==='/v1/private/relationship-history')
        return send(200,{events:store.history(current,url.searchParams.get('relationshipId'))});
      if(req.method==='POST'&&url.pathname==='/v1/private/invitations')return send(201,store.createInvitation(current,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/private/recipient-prepare'){
        const input=await body(req);return send(200,store.prepareRecipient(current,input.token));
      }
      if(req.method==='POST'&&url.pathname==='/v1/private/recipient-confirm'){
        const input=await body(req);return send(200,await store.confirmRecipient(current,input.nonce,input.signature));
      }
      if(req.method==='POST'&&url.pathname==='/v1/private/accept')return send(200,store.accept(current,await body(req)));
      if(req.method==='POST'&&url.pathname==='/v1/private/revoke'){
        const input=await body(req);return send(200,store.revoke(current,input.relationshipId));
      }
      return send(404,{error:'Private route not found'});
    }catch(error){
      return send(error instanceof RelationshipError?error.status:400,{error:error instanceof RelationshipError?error.message:'Private request could not be completed'});
    }
  }
  return {enabled,handle,relationshipPreflight};
}
