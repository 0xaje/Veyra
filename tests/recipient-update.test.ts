import test from "node:test";
import assert from "node:assert/strict";
import { validateRecipientUpdate } from "../src/core/recipient-update.ts";
import { prepareRecipientRegistration } from "../src/core/recipient-registration.ts";

const record = prepareRecipientRegistration({
  chain:"sui",network:"mainnet",counterpartyId:"recipient",
  address:"0x2",confirmation:{method:"independent_contact",
    confirmedAt:"2026-10-21T12:00:00.000Z",reference:"Genuine confirmation required in production"},
  userApprovedStorage:true,
}).record;
const oldAddress="0x"+"0".repeat(63)+"1";
const prior={blobId:"prior-blob",record:{...record,address:oldAddress}};
const valid={memoryIntent:"update" as const,confirmedAddressChange:true,previousAddress:oldAddress,previousBlobId:"prior-blob"};
const observed=async()=>({status:"observed",records:[prior]});
test("new registration does not request prior recall",async()=>{
  let called=false;
  const result=await validateRecipientUpdate({memoryIntent:"new"},record,async()=>{called=true;return observed()});
  assert.equal(result.status,"new");assert.equal(called,false);
});
test("update requires explicit independently confirmed address change",async()=>{
  let called=false;
  await assert.rejects(validateRecipientUpdate({...valid,confirmedAddressChange:false},record,async()=>{called=true;return observed()}),/explicit change confirmation/);
  assert.equal(called,false);
});
test("update rejects absent prior blob ID before recall",async()=>{
  await assert.rejects(validateRecipientUpdate({...valid,previousBlobId:""},record,observed),/prior Walrus blob ID/);
});
test("update rejects unchanged address before recall",async()=>{
  await assert.rejects(validateRecipientUpdate({...valid,previousAddress:"0x2"},record,observed),/must differ/);
});
test("update fails closed when Walrus recall is unavailable",async()=>{
  await assert.rejects(validateRecipientUpdate(valid,record,async()=>({status:"unavailable",records:[]})),/could not be checked/);
});
test("update rejects missing or mismatched prior blob",async()=>{
  await assert.rejects(validateRecipientUpdate({...valid,previousBlobId:"wrong"},record,observed),/not found/);
});
test("update rejects recalled record for another counterparty",async()=>{
  await assert.rejects(validateRecipientUpdate(valid,record,async()=>({status:"observed",records:[{...prior,record:{...prior.record,counterpartyId:"someone-else"}}]})),/not found/);
});
test("update validates exact prior blob and address without authorizing a payment",async()=>{
  const result=await validateRecipientUpdate(valid,record,observed);
  assert.deepEqual(result,{status:"update_checked",priorBlobId:"prior-blob"});
});
test("invalid update intent fails before recall",async()=>{
  let called=false;
  await assert.rejects(validateRecipientUpdate({memoryIntent:"fake" as "update"},record,async()=>{called=true;return observed()}),/Invalid recipient memory intent/);
  assert.equal(called,false);
});
