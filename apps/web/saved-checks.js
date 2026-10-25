/* Anonymous saved assessment memories. No wallet signature, recipient attestation or payment. */
(()=>{
 'use strict';
 const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const button=(text,action)=>{const b=make('button',text);b.type='button';b.addEventListener('click',action);return b;};
 let csrf=null;
 async function request(path,data){
  const response=await fetch('/v1/saved-checks'+path,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(csrf?{'x-veyra-memory-csrf':csrf}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  let value;try{value=await response.json();}catch{throw Error('Memory service unavailable; try again.');}
  if(!response.ok)throw Error(value.error||'Memory request unavailable');if(value.csrfToken)csrf=value.csrfToken;return value;
 }
 const states={prepared:'Ready for your consent',submitting:'Submission outcome pending — do not create another save',pending:'Saving to Walrus — completion pending',stored:'Stored on Walrus',uncertain:'Storage response unknown — this save will not be submitted again automatically',failed:'Storage failed — no completed receipt'};
 function receipt(parent,job){
  parent.replaceChildren(make('p',states[job.phase]||'Status unavailable'));
  if(job.blobId){parent.append(make('p','Walrus blob ID'),make('code',job.blobId),make('p','Record hash'),make('code',job.recordHash));}
  if(job.phase==='stored'){
   const recallStates={verified_via_memwal_recall:'Walrus Memory returned the expected blob ID and matching record hash. Verified through the relayer; independent exact decryption was not performed.',recall_hash_mismatch:'Warning: the recalled bytes did not match the saved hash. Do not rely on this recall.',not_found_in_recall:'This record was not found in the latest recall. Search can omit records; the completed storage receipt remains available.',not_performed:'Stored receipt available. Choose Recall from Walrus to verify the returned content.'};
   parent.append(make('p',recallStates[job.verification]||'Recall verification unavailable.','note'));
  }
  parent.append(make('p','This is a saved check, not recipient approval or permission to pay.','note'));
 }
 function jobActions(parent,job,onUpdate){
  if(job.phase==='pending')parent.append(button('Check storage status',async event=>{const b=event.currentTarget;b.disabled=true;try{const next=await request('/status',{id:job.id});onUpdate(next.job);}catch(e){parent.append(make('p',e.message));}finally{b.disabled=false;}}));
  if(job.phase==='stored')parent.append(button('Recall from Walrus',async event=>{const b=event.currentTarget;b.disabled=true;try{
   const data=await request('/recall',{id:job.id});onUpdate(data.job);
  }catch(e){parent.append(make('p',e.message));}finally{b.disabled=false;}}));
 }
 let generation=0,active=null;
 function reset(){generation++;active?.remove();active=null;}
 window.addEventListener('veyra-assessment-start',reset);
 document.getElementById('preflight')?.addEventListener('input',reset);
 window.addEventListener('veyra-assessment-ready',event=>{
  reset();const ticket=event.detail?.assessmentSaveTicket;if(!ticket)return;
  const version=generation,box=make('section',undefined,'saved-checks'),status=make('p','Save this assessment and return to it later. No wallet sign-in required.','note');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  box.append(make('h3','Remember this check'),status);
  const save=button('Save this check',async()=>{
   save.disabled=true;status.textContent='Preparing the exact record for your review…';
   try{
    await request('/session',{});const data=await request('/prepare',{assessmentTicket:ticket});
    if(version!==generation)return;
    if(data.job.phase!=='prepared'){showJob(data.job);return;}
    const review=make('div',undefined,'saved-check-review');review.append(make('p',data.disclosure));
    const details=make('details'),summary=make('summary','View exact record and hash');details.append(summary,make('pre',JSON.stringify(data.job.record,null,2)),make('code',data.job.recordHash));review.append(details);
    const label=make('label'),consent=document.createElement('input');consent.type='checkbox';label.append(consent,document.createTextNode(' I agree to save this exact assessment to Walrus.'));review.append(label);
    const confirm=button('Confirm save to Walrus',async()=>{
     confirm.disabled=true;consent.disabled=true;status.textContent='Submitting once. Please wait…';
     try{const result=await request('/submit',{id:data.job.id,recordHash:data.job.recordHash,consent:'SAVE_ASSESSMENT_TO_WALRUS'});if(version===generation)showJob(result.job);}
     catch(e){status.textContent=e.message+' Your reviewed record is retained. Retry this same save; do not run a new check to retry storage.';confirm.disabled=false;consent.disabled=false;}
    });confirm.disabled=true;consent.addEventListener('change',()=>{confirm.disabled=!consent.checked;});
    review.append(confirm,button('Cancel',()=>{review.remove();save.disabled=false;status.textContent='Not submitted to Walrus.';}));box.append(review);consent.focus();status.textContent='Review the address and disclosure before saving.';
   }catch(e){if(version===generation){status.textContent=e.message;save.disabled=false;}}
  });
  function showJob(job,remaining=5){
   if(version!==generation)return;
   box.replaceChildren(make('h3','Your saved check'));const content=make('div');box.append(content);receipt(content,job);jobActions(content,job,showJob);
   const link=make('a','Open saved checks →');link.href='/history#saved-checks';box.append(link,make('p','This browser retains access for up to 180 days. Keep a recovery code from Activity History to move access to another browser. Walrus availability depends on its storage lease.','note'));
   if(job.phase==='pending'&&remaining>0)setTimeout(async()=>{if(version!==generation||!box.isConnected)return;try{const next=await request('/status',{id:job.id});showJob(next.job,remaining-1);}catch{/* Manual status action remains available. */}},2500);
  }
  box.append(save);const summary=document.getElementById('consumerSummary');if(summary)summary.after(box);else document.getElementById('results')?.append(box);active=box;
 });
 async function history(){
  const host=document.getElementById('saved-checks');if(!host)return;
  const message=make('p','Loading saved checks…');message.setAttribute('role','status');message.setAttribute('aria-live','polite');host.append(message);
  const restore=make('details');restore.append(make('summary','Restore saved checks on this browser'));
  const label=make('label','Recovery code '),input=document.createElement('input');input.type='password';input.autocomplete='off';input.spellcheck=false;label.append(input);restore.append(label,make('p','Your code grants access to your saved checks. Restoring signs out the previous browser and invalidates the used code.','note'));
  restore.append(button('Restore my saved checks',async event=>{const b=event.currentTarget;b.disabled=true;try{await request('/restore',{recoveryCode:input.value.trim()});input.value='';await load();}catch(e){message.textContent=e.message;}finally{b.disabled=false;}}));host.append(restore);
  const list=make('div');host.append(list);
  async function load(){
   list.replaceChildren();try{
    const access=await request('/session');if(!access.exists){message.textContent='No saved-check access in this browser yet. Save a check from the address checker, or restore using your private recovery code.';return;}
    const data=await request('');message.textContent=data.records.length?'Your saved checks are loaded from persistent storage. Each card distinguishes its stored snapshot from a fresh Walrus recall.':'No saved checks yet. Run an address check and choose “Save this check”.';
    const recovery=button('Get my recovery code',async event=>{const b=event.currentTarget;b.disabled=true;try{const value=await request('/recovery-code',{});const holder=make('div');holder.append(make('p',value.warning));const field=document.createElement('textarea');field.readOnly=true;field.value=value.recoveryCode;field.setAttribute('aria-label','Private saved checks recovery code');holder.append(field);list.prepend(holder);field.focus();field.select();b.remove();}catch(e){message.textContent=e.message;b.disabled=false;}});list.append(recovery);
    for(const job of data.records){const card=make('section',undefined,'saved-check-card');list.append(card);draw(job);
     function draw(current){card.replaceChildren(make('h3',current.label),make('code',current.record.proposedAddress),make('p','Checked '+new Date(current.record.checkedAt).toLocaleString()),make('p','Finding: '+current.record.conclusion.replaceAll('_',' ')));const content=make('div');card.append(content);receipt(content,current);jobActions(content,current,draw);
      const repeat=make('a','Check this address again →');repeat.href='/';repeat.addEventListener('click',()=>{try{sessionStorage.setItem('veyra.repeat-check',JSON.stringify({counterpartyId:current.label,proposedAddress:current.record.proposedAddress}));}catch{}});card.append(repeat);
     }
    }
   }catch(e){message.textContent=e.message;}
  }
  host.append(button('Refresh saved checks',load));await load();
 }
 history();
 // Rechecking uses only private browser-session state; no address or recovery token enters a URL.
 if(document.getElementById('preflight'))try{const repeat=JSON.parse(sessionStorage.getItem('veyra.repeat-check')||'null');if(repeat){sessionStorage.removeItem('veyra.repeat-check');document.getElementById('counterparty').value=repeat.counterpartyId;document.getElementById('address').value=repeat.proposedAddress;}}catch{}
})();
