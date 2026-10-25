import nodeTest, { type TestContext } from "node:test";
import { postgresFixture } from "./relationship-storage-fixtures.ts";
import { verifyExactPublication } from "../src/core/exact-walrus-record.ts";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PublicationLedger } from "../src/core/publication-ledger.ts";
for(const backend of ['sqlite', ...(process.env.TEST_DATABASE_URL?['postgres']:[])]) {
const test=(name:string, ...args:any[])=>{
 if(backend==='postgres'&&name.includes('corrupt database'))return;
 const fn=args.pop() as (t:TestContext)=>Promise<void>;
 return args.length?nodeTest(backend+': '+name,args[0],fn):nodeTest(backend+': '+name,fn);
};
const openStore=(path:string,config:{maxDailyWritesPerWallet:number;maxGlobalDailyWrites:number})=>backend==='postgres'?PublicationLedger.connect(path,config,true):PublicationLedger.open(path,config);
const limits = { maxDailyWritesPerWallet: 1, maxGlobalDailyWrites: 2 };
async function folder(t: {
    after: (fn: () => Promise<void>) => void;
}) {
    if(backend==='postgres'){const fixture=await postgresFixture();t.after(()=>fixture.dispose());return fixture.url;}
    const dir = await mkdtemp(join(tmpdir(), "veyra-publication-test-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    return join(dir, "state.sqlite");
}
// All blob/job labels below are explicit local lifecycle fixtures, not
// claims that any external provider accepted or stored a real memory.
test("M3: exact preparation and capacity survive connection close/reopen", async (t:TestContext) => {
    const path = await folder(t);
    let db = await openStore(path, limits);
    const prepared = await db.issue("0x1", "local-recipient");
    await db.close();
    db = await openStore(path, limits);
    try {
        assert.equal((await db.get(prepared.consentPayload))?.candidateJson, prepared.candidateJson);
        const reserved = await db.reserve(prepared.consentPayload);
        assert.equal(reserved.created, true);
        assert.equal((await db.reserve(prepared.consentPayload)).created, false);
        await db.close();
        db = await openStore(path, limits);
        assert.equal((await db.getJob(prepared.consentPayload.nonce))?.phase, "reserved");
        const other = await db.issue("0x1", "other-local-recipient");
        await assert.rejects(async () => await db.reserve(other.consentPayload), /Wallet.*ceiling/);
    }
    finally {
        await db.close();
    }
});
test("M3: separate connections share atomic wallet and global reservations", async (t:TestContext) => {
    const path = await folder(t);
    const a = await openStore(path, limits), b = await openStore(path, limits);
    try {
        const first = await a.issue("0x1", "local-a"), second = await b.issue("0x1", "local-b");
        await a.reserve(first.consentPayload);
        await assert.rejects(async () => await b.reserve(second.consentPayload), /Wallet.*ceiling/);
        const third = await b.issue("0x2", "local-c");
        await b.reserve(third.consentPayload);
        const fourth = await a.issue("0x3", "local-d");
        await assert.rejects(async () => await a.reserve(fourth.consentPayload), /Global.*ceiling/);
        assert.equal((await b.reserve(first.consentPayload)).created, false);
    }
    finally {
        await a.close();
        await b.close();
    }
});
test("M3: concurrent processes cannot both spend a one-write wallet quota", { timeout: 15000 }, async (t:TestContext) => {
    const path = await folder(t);
    const db = await openStore(path, limits);
    const first = await db.issue("0x1", "local-a"), second = await db.issue("0x1", "local-b");
    await db.close();
    const moduleUrl = new URL("../src/core/publication-ledger.ts", import.meta.url).href;
    const code = `import { PublicationLedger } from ${JSON.stringify(moduleUrl)};
    const db = await PublicationLedger.${backend==='postgres'?'connect':'open'}(process.argv[2], {maxDailyWritesPerWallet:1,maxGlobalDailyWrites:2},true);
    try { await db.reserve(JSON.parse(process.argv[1])); console.log(JSON.stringify({allowed:true})); }
    catch(e) { console.log(JSON.stringify({allowed:false,reason:e.message})); }
    finally { await db.close(); }`;
    const run = promisify(execFile);
    const results = await Promise.all([first, second].map(p => run(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", code, JSON.stringify(p.consentPayload), path])));
    const outcomes = results.map(r => JSON.parse(r.stdout.trim()));
    assert.equal(outcomes.filter(r => r.allowed).length, 1);
    assert.match(outcomes.find(r => !r.allowed).reason, /Wallet.*ceiling/);
});
test("M3: accepted job and receipt recover without another submission", async (t:TestContext) => {
    const path = await folder(t);
    let db = await openStore(path, limits);
    const first = await db.issue("0x1", "local-recipient");
    await db.reserve(first.consentPayload);
    assert.equal(await db.markSubmitting(first.consentPayload.nonce), true);
    assert.equal(await db.markSubmitting(first.consentPayload.nonce), false);
    await db.markAccepted(first.consentPayload.nonce, "local-fixture-job");
    await db.markUncertain(first.consentPayload.nonce);
    await db.close();
    db = await openStore(path, limits);
    try {
        assert.equal((await db.getJob(first.consentPayload.nonce))?.providerJobId, "local-fixture-job");
        assert.equal((await db.getJob(first.consentPayload.nonce))?.phase, "uncertain");
        await assert.rejects(async () => await db.complete(first.consentPayload.nonce, "wrong-fixture-job", "local-fixture-blob"), /accepted/);
        const receipt = await db.complete(first.consentPayload.nonce, "local-fixture-job", "local-fixture-blob");
        assert.deepEqual(await db.complete(first.consentPayload.nonce, "local-fixture-job", "local-fixture-blob"), receipt);
        await assert.rejects(async () => await db.complete(first.consentPayload.nonce, "local-fixture-job", "different-fixture-blob"), /Conflicting/);
        assert.equal((await db.reserve(first.consentPayload)).job.receipt?.receiptId, receipt.receiptId);
        assert.equal((await db.getReceiptsForWallet(first.candidate.address)).length, 1);
        assert.equal((await db.getReceiptsForWallet("0x-unrelated")).length, 0);
    }
    finally {
        await db.close();
    }
});
test("M3: unresolved prior-day jobs retain capacity after day rollover", async (t:TestContext) => {
    const path = await folder(t);
    const db = await openStore(path, limits);
    try {
        const past = Date.now() - 2 * 86400000;
        const first = await db.issue("0x1", "local-a", past);
        await db.reserve(first.consentPayload, past);
        const second = await db.issue("0x1", "local-b");
        await assert.rejects(async () => await db.reserve(second.consentPayload), /Wallet.*ceiling/);
        assert.equal(await db.get(first.consentPayload), null);
    }
    finally {
        await db.close();
    }
});
test("M3: corrupt database and invalid ceilings fail closed", async (t:TestContext) => {
    const path = await folder(t);
    await writeFile(path, "not a SQLite database", { mode: 0o600 });
    await assert.rejects(async () => await openStore(path, limits));
    for (const value of [NaN, -1, Infinity, 1.5])
        await assert.rejects(async () => await openStore(path, { ...limits, maxGlobalDailyWrites: value }), /Invalid/);
    await assert.rejects(async () => await openStore(":memory:", limits), /durable/);
});
test("M3: zero budget rejects publication before provider submission", async (t:TestContext) => {
    const path = await folder(t);
    const db = await openStore(path, { maxDailyWritesPerWallet: 0, maxGlobalDailyWrites: 0 });
    try {
        const first = await db.issue("0x1", "local-a");
        await assert.rejects(async () => await db.reserve(first.consentPayload), /ceiling/);
    }
    finally {
        await db.close();
    }
});
test("M3: alternate normalized address spelling cannot bypass a wallet ceiling", async (t:TestContext) => {
    const path = await folder(t);
    const db = await openStore(path, limits);
    try {
        const first = await db.issue("0x1", "local-a"), second = await db.issue("0x1", "local-b");
        await db.reserve(first.consentPayload);
        await assert.rejects(async () => await db.reserve({ ...second.consentPayload, address: "0x1" }), /Wallet.*ceiling/);
    }
    finally {
        await db.close();
    }
});

test('M3: publication staging binds one browser session and origin; zero hosted budgets cannot be raised silently',async (t:TestContext)=>{
 const path=await folder(t),db=await openStore(path,limits);
 try {
  const binding={origin:'https://veyra.example',sessionHash:'a'.repeat(64)};
  const prepared=await db.issue('0x1','opaque-relation',Date.now(),binding);
  assert.match(prepared.consentMessage,/Origin: https:\/\/veyra.example/);
  assert.ok(!prepared.candidateJson.includes(binding.sessionHash));
  assert.equal(await db.get(prepared.consentPayload),null);
  assert.equal(await db.get(prepared.consentPayload,Date.now(),{...binding,sessionHash:'b'.repeat(64)}),null);
  assert.equal(await db.get({...prepared.consentPayload,origin:'https://other.example'},Date.now(),binding),null);
  assert.equal((await db.get(prepared.consentPayload,Date.now(),binding))?.recordHash,prepared.recordHash);
  await assert.rejects(db.reserve(prepared.consentPayload),/expired or changed/);
  assert.equal((await db.reserve(prepared.consentPayload,Date.now(),binding)).created,true);
 }finally{await db.close();}
 await assert.rejects(openStore(path,{...limits,maxGlobalDailyWrites:3}),/persisted policy/);
});
test('M2/M3: durable public receipt index separates stored jobs from exact-byte verification',async (t:TestContext)=>{
 // Local lifecycle/hash fixtures only: no provider accepted these labels, and no network write occurs.
 const path=await folder(t),db=await openStore(path,limits);
 try {
  const prepared=await db.issue('0x1','opaque-relation');await db.reserve(prepared.consentPayload);
  await db.markSubmitting(prepared.consentPayload.nonce);await db.markAccepted(prepared.consentPayload.nonce,'local-fixture-job');
  const receipt=await db.complete(prepared.consentPayload.nonce,'local-fixture-job','local-fixture-blob');
  assert.equal((await db.recordsForCounterparty('opaque-relation'))[0].verification,null);
  assert.deepEqual(await db.recordsForCounterparty('unrelated'),[]);
  const verification=verifyExactPublication(new TextEncoder().encode(prepared.candidateJson),receipt);
  await assert.rejects(db.recordVerification(prepared.consentPayload.nonce,{...verification,blobId:'wrong-fixture-blob'}),/bind/);
  await db.recordVerification(prepared.consentPayload.nonce,verification);
  const indexed=await db.recordsForCounterparty('opaque-relation');assert.equal(indexed[0].verification?.status,'verified');
  assert.equal(indexed[0].prepared.recordHash,receipt.recordHash);
  assert.equal((await db.getVerification(prepared.consentPayload.nonce))?.paymentAuthorized,false);
 }finally{await db.close();}
});
}
