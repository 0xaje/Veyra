// Private contacts integrate with the existing payer form and receiving page.
// No provider credentials, automatic messages, Walrus writes or payments.
(()=>{
'use strict';
const main=document.querySelector('main.main');if(!main)return;
let invite=new URLSearchParams(location.hash.slice(1)).get('invite');
if(invite&&!/^[A-Za-z0-9_-]{43}$/.test(invite))invite=null;
if(invite)history.replaceState(null,'',location.pathname+location.search);
const receiving=location.pathname==='/verify-wallet';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action)=>{const b=node('button',text,'secondary-btn');b.type='button';b.addEventListener('click',action);return b;};
const input=(label,placeholder,type='text')=>{const host=node('label',label);const control=node('input');control.type=type;control.placeholder=placeholder;host.append(control);return {host,control};};
const panel=node('section',undefined,'panel private-contacts');panel.id='private-contacts';
const heading=node('h2',receiving?'Confirm a private receiving invitation':'Your private recipient contacts');
const intro=node('p','A wallet signature proves key control. Confirm the person, full address and code through a trusted conversation before accepting a contact. Nothing here publishes to Walrus or authorizes payment.');
const status=node('p','Checking private-contact availability…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
const controls=node('div',undefined,'private-controls'),content=node('div');
panel.append(heading,intro,status,controls,content);
const mainHeading=main.querySelector('.heading');if(mainHeading)mainHeading.after(panel);else main.prepend(panel);
if(receiving&&invite)for(const existing of main.querySelectorAll(':scope > .panel'))if(existing!==panel)existing.hidden=true;
const walletSelect=node('select');walletSelect.setAttribute('aria-label','Signing wallet');
const accountSelect=node('select');accountSelect.setAttribute('aria-label','Wallet account');accountSelect.hidden=true;
const signIn=button('Sign in with your wallet',login),signOut=button('Sign out',logout);
signIn.disabled=true;signOut.hidden=true;controls.append(walletSelect,accountSelect,signIn,signOut);
const wallets=new Map();let session=null,selectedWallet=null,account=null,contacts=[],draft=null,generation=0,available=false,unsubscribe=null;
const contactSelect=node('select');contactSelect.id='private-contact-select';contactSelect.setAttribute('aria-label','Private recipient contact');
const form=document.getElementById('preflight');let contactLabel=null;
if(form){contactLabel=node('label','Use a private contact (optional)');contactLabel.id='private-contact-label';contactLabel.hidden=true;contactLabel.append(contactSelect);form.prepend(contactLabel);contactSelect.disabled=true;}
function supported(w){return Boolean(w?.features?.['standard:connect']?.connect&&w?.features?.['sui:signPersonalMessage']?.signPersonalMessage&&
 (w.chains?.some(c=>c.startsWith('sui:'))||w.accounts?.some(a=>a.chains?.some(c=>c.startsWith('sui:')))));}
function renderWallets(){const old=walletSelect.value;walletSelect.replaceChildren(new Option(wallets.size?'Choose your wallet':'No compatible Sui wallet detected',''));
 for(const key of wallets.keys())walletSelect.add(new Option(key,key));if(wallets.has(old))walletSelect.value=old;
 if(wallets.size===1)walletSelect.value=[...wallets.keys()][0];}
function register(...items){for(const w of items)if(supported(w))wallets.set(w.name+' ('+(w.version||'unknown version')+')',w);renderWallets();
 return ()=>{for(const w of items)for(const [key,value]of wallets)if(value===w)wallets.delete(key);renderWallets();};}
window.addEventListener('wallet-standard:register-wallet',event=>{if(typeof event.detail==='function')event.detail({register});});
window.dispatchEvent(new CustomEvent('wallet-standard:app-ready',{detail:{register}}));renderWallets();
function setStatus(text){status.textContent=text;}
async function request(path,data){const version=generation;const response=await fetch(path,{method:data===undefined?'GET':'POST',cache:'no-store',
 headers:{...(data===undefined?{}:{'content-type':'application/json'}),...(session?{'x-veyra-csrf':session.csrfToken}:{})},
 ...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await response.json();
 if(version!==generation)throw new Error('Wallet session changed; refresh your private contacts.');
 if((response.status===401||response.status===403)&&session)expireView();
 if(!response.ok)throw new Error(result.error||result.reason||'Private request failed');return result;}
function resetPrivateView(){if(contactSelect.value||document.getElementById('private-confirmation-trace')){document.getElementById('private-confirmation-trace')?.remove();const address=document.getElementById('address');if(address)address.value='';const results=document.getElementById('results'),empty=document.getElementById('empty');if(results)results.hidden=true;if(empty)empty.hidden=false;}contacts=[];draft=null;content.replaceChildren();contactSelect.replaceChildren(new Option('Public evidence check — no private contact',''));contactSelect.disabled=true;if(contactLabel)contactLabel.hidden=true;
 const field=document.getElementById('counterparty');if(field){field.readOnly=false;if(field.dataset.private==='true'){field.value='';delete field.dataset.private;}}
}
function expireView(){generation++;session=null;account=null;draft=null;resetPrivateView();signIn.hidden=false;signOut.hidden=true;setStatus('Your private session expired. Sign in again.');}
window.addEventListener('veyra-private-session-expired',expireView);
async function logout(){const previous=session;generation++;session=null;account=null;selectedWallet=null;draft=null;resetPrivateView();
 signIn.hidden=false;signOut.hidden=true;accountSelect.hidden=true;setStatus('Signed out of private contacts.');
 if(unsubscribe){unsubscribe();unsubscribe=null;}
 if(previous)try{await fetch('/v1/private/logout',{method:'POST',headers:{'content-type':'application/json','x-veyra-csrf':previous.csrfToken},body:'{}'});}catch{session=previous;signOut.hidden=false;signOut.textContent='Retry secure sign-out';setStatus('Private view cleared, but server sign-out was not confirmed. Retry secure sign-out before leaving a shared device.');}}
async function login(){if(!available)return;signIn.disabled=true;
 try{
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready',{detail:{register}}));
  const wallet=wallets.get(walletSelect.value);if(!wallet)throw new Error('Install/unlock a compatible Sui wallet and select it.');
  if(session&&selectedWallet&&selectedWallet!==wallet)await logout();
  const connected=await wallet.features['standard:connect'].connect();
  const accounts=(connected?.accounts||wallet.accounts||[]).filter(a=>a.chains?.some(c=>c.startsWith('sui:'))&&a.features?.includes('sui:signPersonalMessage'));
  if(!accounts.length)throw new Error('No signing-capable Sui account was returned.');
  const chosen=accountSelect.value;accountSelect.replaceChildren(new Option('Choose an account',''));
  for(const a of accounts)accountSelect.add(new Option(a.address,a.address));
  accountSelect.hidden=accounts.length===1;
  account=accounts.length===1?accounts[0]:accounts.find(a=>a.address===chosen);
  if(!account){setStatus('Choose which wallet account to use, then sign in.');return;}
  accountSelect.value=account.address;selectedWallet=wallet;
  const challenge=await request('/v1/private/login-challenge',{address:account.address});
  setStatus('Review the private sign-in message in your wallet. It does not publish or move funds.');
  const signed=await wallet.features['sui:signPersonalMessage'].signPersonalMessage({account,message:new TextEncoder().encode(challenge.message)});
  const authenticated=await request('/v1/private/login',{nonce:challenge.nonce,signature:signed.signature});
  session=authenticated;signIn.textContent='Reconnect signing wallet';signOut.hidden=false;
  if(unsubscribe)unsubscribe();
  unsubscribe=wallet.features['standard:events']?.on?.('change',()=>{void logout();});
  await refresh();
 }catch(error){setStatus(error.message||'Wallet sign-in was cancelled.');}finally{signIn.disabled=false;}}
function contactSelection(){const selected=contacts.find(c=>c.id===contactSelect.value),field=document.getElementById('counterparty');
 if(field){field.readOnly=Boolean(selected);if(selected){field.value=selected.id;field.dataset.private='true';}else if(field.dataset.private==='true'){field.value='';delete field.dataset.private;}}}
contactSelect.addEventListener('change',contactSelection);
window.veyraRelationshipContext=()=>session&&contactSelect.value?{relationshipId:contactSelect.value,csrfToken:session.csrfToken}:null;
for(const id of ['example-friend','example-lookalike'])document.getElementById(id)?.addEventListener('click',()=>{contactSelect.value='';contactSelection();},{capture:true});
async function refresh(){if(!session)return;const data=await request('/v1/private/relationships');contacts=data.relationships;
 const selected=contactSelect.value;contactSelect.replaceChildren(new Option('Public evidence check — no private contact',''));
 for(const c of contacts)if(c.state==='active')contactSelect.add(new Option(c.label,c.id));
 if(contacts.some(c=>c.id===selected&&c.state==='active'))contactSelect.value=selected;contactSelect.disabled=false;if(contactLabel)contactLabel.hidden=!contacts.some(c=>c.state==='active');contactSelection();
 signOut.hidden=false;signOut.textContent='Sign out';setStatus('Private session: '+session.address+'. Contact confirmations remain subject to independent review.');
 content.replaceChildren();if(receiving)renderRecipient();else renderPayer();}
function renderPayer(){
 const manager=node('details');manager.append(node('summary','Create invitations and confirm contacts'));
 const label=input('Private contact name','e.g. John — my supplier');label.control.maxLength=80;
 const create=button('Create private invitation',async()=>{create.disabled=true;try{const result=await request('/v1/private/invitations',{label:label.control.value});await refresh();showInvitation(result);}catch(e){setStatus(e.message);}finally{create.disabled=false;}});
 manager.append(label.host,create);content.append(manager);
 for(const c of contacts){const card=node('section',undefined,'private-contact-card');card.append(node('h3',c.label),node('p',c.state==='revoked'?'Contact revoked':c.acceptedAddress?'Recipient relationship confirmed by you':'Awaiting your independent confirmation'));
 if(c.acceptedAddress){card.append(node('code',c.acceptedAddress),node('p','Confirmed '+new Date(c.acceptedAt).toLocaleString()+' via '+c.confirmationMethod.replaceAll('_',' ')+'. This is your attestation, not identity verification.'));}
 if(c.state==='active'){
  card.append(button('Create a fresh invitation',async()=>{try{const result=await request('/v1/private/invitations',{relationshipId:c.id});await refresh();showInvitation(result);}catch(e){setStatus(e.message);}}));
  if(c.acceptedAddress)card.append(button('Use in address check',()=>{contactSelect.value=c.id;contactSelection();document.getElementById('address')?.focus();}));
  card.append(button('Revoke this contact',async()=>{try{await request('/v1/private/revoke',{relationshipId:c.id});await refresh();}catch(e){setStatus(e.message);}}));
 }
 if(c.pendingClaim&&c.state==='active'){
  const pending=c.pendingClaim;card.append(node('h3','A receiving address needs your confirmation'),node('code',pending.receivingAddress),node('p','Ask the recipient for their code through the conversation or phone number you already trust. Compare the complete address. No saved address changes until you accept.'));
  const code=input('Code supplied by the recipient','ABCD-EF01-2345');code.control.maxLength=14;
  const method=node('select');method.setAttribute('aria-label','Trusted confirmation channel');method.add(new Option('Choose the channel you actually used',''));
  for(const [value,text]of [['established_chat','Existing trusted conversation'],['known_phone_call','Call to a number already known'],['in_person','In person']])method.add(new Option(text,value));
  const check=node('input');check.type='checkbox';const consent=node('label','I independently confirmed the person, full receiving address and code through this trusted channel.');consent.prepend(check);
  const accept=button('Accept recipient confirmation',async()=>{accept.disabled=true;try{
   await request('/v1/private/accept',{relationshipId:c.id,claimId:pending.id,code:code.control.value.trim(),expectedAddress:pending.receivingAddress,method:method.value,independentlyConfirmed:check.checked});await refresh();
  }catch(e){setStatus(e.message);}finally{accept.disabled=false;}});
  card.append(code.host,method,consent,accept);
 }
 const audit=node('details');audit.append(node('summary','Recent private confirmation history (up to 200 events)'));
 const auditBody=node('div');audit.append(auditBody);let loaded=false;
 audit.addEventListener('toggle',async()=>{if(!audit.open||loaded)return;try{const result=await request('/v1/private/relationship-history?relationshipId='+encodeURIComponent(c.id));
  for(const event of result.events)auditBody.append(node('p',new Date(event.created).toLocaleString()+' · '+event.event.replaceAll('_',' ')));loaded=true;}catch(e){auditBody.textContent=e.message;}});
 card.append(audit);manager.append(card);
 }
}
function showInvitation(result){const box=node('section',undefined,'private-contact-card');box.append(node('h3','Send this link privately to '+result.label),node('p','Use an existing trusted conversation. Anyone with the link can propose an address; you must still independently accept the person, full address and code. Expires '+new Date(result.expiresAt).toLocaleString()+'.'));
 const link=node('input');link.value=result.invitationUrl;link.readOnly=true;link.setAttribute('aria-label','Private invitation link');
 box.append(link,button('Copy invitation link',async()=>{try{await navigator.clipboard.writeText(result.invitationUrl);setStatus('Invitation copied. Send it yourself through your trusted conversation.');}catch{link.focus();link.select();setStatus('Select and copy the invitation link.');}}));content.prepend(box);}
function renderRecipient(){
 const box=node('section',undefined,'private-contact-card');content.append(box);
 if(!invite){box.append(node('p','Open the private invitation sent by your payer. Your previous confirmations are listed below.'));void received(box);return;}
 box.append(node('p','This confirms your intended receiving address for one private payer relationship. Your wallet will sign the exact address and invitation. It does not publish to Walrus.'));
 const review=node('pre');review.className='private-record';
 const prepare=button('Review receiving confirmation',async()=>{prepare.disabled=true;try{
  draft=await request('/v1/private/recipient-prepare',{token:invite});review.textContent=JSON.stringify(draft.candidate,null,2);confirm.disabled=false;
  setStatus('Review the receiving address and payer wallet. Sign only if this invitation came through your trusted conversation.');
 }catch(e){setStatus(e.message);}finally{prepare.disabled=false;}});
 const checked=node('input');checked.type='checkbox';const statement=node('label','I intend to receive funds at this address for this payer relationship. I understand this is private and does not authorize payments.');statement.prepend(checked);
 const confirm=button('Sign private receiving confirmation',async()=>{confirm.disabled=true;try{
  if(!draft||!checked.checked)throw new Error('Review the record and confirm your receiving intent first.');
  if(!selectedWallet||!account)throw new Error('Reconnect your signing wallet, then review this confirmation again.');
  if(account.address.toLowerCase()!==session.address.toLowerCase())throw new Error('Signing wallet changed. Sign in again.');
  const signed=await selectedWallet.features['sui:signPersonalMessage'].signPersonalMessage({account,message:new TextEncoder().encode(draft.message)});
  const result=await request('/v1/private/recipient-confirm',{nonce:draft.nonce,signature:signed.signature});draft=null;invite=null;
  box.replaceChildren(node('h3','Share this code through your trusted conversation'),node('code',result.verificationCode),node('code',result.receivingAddress),node('p','Your payer must check the full address and this code before accepting. No Walrus memory or payment was created.'));
 }catch(e){draft=null;confirm.disabled=true;setStatus(e.message+' Review a fresh confirmation before retrying.');}});confirm.disabled=true;
 box.append(prepare,review,statement,confirm);void received(box);
}
async function received(host){try{const data=await request('/v1/private/recipient-confirmations');if(!data.confirmations.length)return;
 const history=node('details');history.append(node('summary','Your previous private receiving confirmations'));
 for(const c of data.confirmations){const item=node('section',undefined,'private-contact-card');item.append(node('code',c.verificationCode),node('code',c.receivingAddress),node('p','Payer wallet: '+c.payerAddress+' · '+c.status));history.append(item);}host.append(history);
 }catch(e){setStatus(e.message);}}
(async()=>{try{
 const health=await fetch('/health',{cache:'no-store'}).then(r=>r.json());available=health.privateRelationshipsEnabled===true;signIn.disabled=!available;
 if(!available){controls.hidden=true;contactSelect.disabled=true;setStatus('Private contacts are disabled until persistent storage and deployment security are configured. Public read-only address checks remain available.');return;}
 try{session=await request('/v1/private/session');await refresh();}catch{setStatus('Sign in with the wallet you want to use for this private relationship. No wallet transaction is requested.');}
 }catch{controls.hidden=true;setStatus('Private-contact availability could not be checked.');}})();
})();
