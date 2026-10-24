import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PublicationLedger } from "../src/core/publication-ledger.ts";

const limits = { maxDailyWritesPerWallet: 1, maxGlobalDailyWrites: 2 };
async function folder(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(join(tmpdir(), "veyra-publication-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, "state.sqlite");
}

// All blob/job labels below are explicit local lifecycle fixtures, not
// claims that any external provider accepted or stored a real memory.
test("M3: exact preparation and capacity survive connection close/reopen", async t => {
  const path = await folder(t);
  let db = new PublicationLedger(path, limits);
  const prepared = db.issue("0x1", "local-recipient");
  db.close();
  db = new PublicationLedger(path, limits);
  try {
    assert.equal(db.get(prepared.consentPayload)?.candidateJson, prepared.candidateJson);
    const reserved = db.reserve(prepared.consentPayload);
    assert.equal(reserved.created, true);
    assert.equal(db.reserve(prepared.consentPayload).created, false);
    db.close();
    db = new PublicationLedger(path, limits);
    assert.equal(db.getJob(prepared.consentPayload.nonce)?.phase, "reserved");
    const other = db.issue("0x1", "other-local-recipient");
    assert.throws(() => db.reserve(other.consentPayload), /Wallet.*ceiling/);
  } finally { db.close(); }
});

test("M3: separate connections share atomic wallet and global reservations", async t => {
  const path = await folder(t);
  const a = new PublicationLedger(path, limits), b = new PublicationLedger(path, limits);
  try {
    const first = a.issue("0x1", "local-a"), second = b.issue("0x1", "local-b");
    a.reserve(first.consentPayload);
    assert.throws(() => b.reserve(second.consentPayload), /Wallet.*ceiling/);
    const third = b.issue("0x2", "local-c"); b.reserve(third.consentPayload);
    const fourth = a.issue("0x3", "local-d");
    assert.throws(() => a.reserve(fourth.consentPayload), /Global.*ceiling/);
    assert.equal(b.reserve(first.consentPayload).created, false);
  } finally { a.close(); b.close(); }
});

test("M3: concurrent processes cannot both spend a one-write wallet quota", { timeout: 15000 }, async t => {
  const path = await folder(t);
  const db = new PublicationLedger(path, limits);
  const first = db.issue("0x1", "local-a"), second = db.issue("0x1", "local-b");
  db.close();
  const moduleUrl = new URL("../src/core/publication-ledger.ts", import.meta.url).href;
  const code = `import { PublicationLedger } from ${JSON.stringify(moduleUrl)};
    const db = new PublicationLedger(process.argv[2], {maxDailyWritesPerWallet:1,maxGlobalDailyWrites:2});
    try { db.reserve(JSON.parse(process.argv[1])); console.log(JSON.stringify({allowed:true})); }
    catch(e) { console.log(JSON.stringify({allowed:false,reason:e.message})); }
    finally { db.close(); }`;
  const run = promisify(execFile);
  const results = await Promise.all([first, second].map(p =>
    run(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", code, JSON.stringify(p.consentPayload), path])));
  const outcomes = results.map(r => JSON.parse(r.stdout.trim()));
  assert.equal(outcomes.filter(r => r.allowed).length, 1);
  assert.match(outcomes.find(r => !r.allowed).reason, /Wallet.*ceiling/);
});

test("M3: accepted job and receipt recover without another submission", async t => {
  const path = await folder(t);
  let db = new PublicationLedger(path, limits);
  const first = db.issue("0x1", "local-recipient");
  db.reserve(first.consentPayload);
  assert.equal(db.markSubmitting(first.consentPayload.nonce), true);
  assert.equal(db.markSubmitting(first.consentPayload.nonce), false);
  db.markAccepted(first.consentPayload.nonce, "local-fixture-job");
  db.markUncertain(first.consentPayload.nonce);
  db.close();
  db = new PublicationLedger(path, limits);
  try {
    assert.equal(db.getJob(first.consentPayload.nonce)?.providerJobId, "local-fixture-job");
    assert.equal(db.getJob(first.consentPayload.nonce)?.phase, "uncertain");
    assert.throws(() => db.complete(first.consentPayload.nonce, "wrong-fixture-job", "local-fixture-blob"), /accepted/);
    const receipt = db.complete(first.consentPayload.nonce, "local-fixture-job", "local-fixture-blob");
    assert.deepEqual(db.complete(first.consentPayload.nonce, "local-fixture-job", "local-fixture-blob"), receipt);
    assert.throws(() => db.complete(first.consentPayload.nonce, "local-fixture-job", "different-fixture-blob"), /Conflicting/);
    assert.equal(db.reserve(first.consentPayload).job.receipt?.receiptId, receipt.receiptId);
    assert.equal(db.getReceiptsForWallet(first.candidate.address).length, 1);
    assert.equal(db.getReceiptsForWallet("0x-unrelated").length, 0);
  } finally { db.close(); }
});

test("M3: unresolved prior-day jobs retain capacity after day rollover", async t => {
  const path = await folder(t);
  const db = new PublicationLedger(path, limits);
  try {
    const past = Date.now() - 2 * 86400000;
    const first = db.issue("0x1", "local-a", past);
    db.reserve(first.consentPayload, past);
    const second = db.issue("0x1", "local-b");
    assert.throws(() => db.reserve(second.consentPayload), /Wallet.*ceiling/);
    assert.equal(db.get(first.consentPayload), null);
  } finally { db.close(); }
});

test("M3: corrupt database and invalid ceilings fail closed", async t => {
  const path = await folder(t);
  await writeFile(path, "not a SQLite database", { mode: 0o600 });
  assert.throws(() => new PublicationLedger(path, limits));
  for (const value of [NaN, -1, Infinity, 1.5])
    assert.throws(() => new PublicationLedger(path, { ...limits, maxGlobalDailyWrites: value }), /Invalid/);
  assert.throws(() => new PublicationLedger(":memory:", limits), /durable/);
});

test("M3: zero budget rejects publication before provider submission", async t => {
  const path = await folder(t);
  const db = new PublicationLedger(path, { maxDailyWritesPerWallet: 0, maxGlobalDailyWrites: 0 });
  try { const first = db.issue("0x1", "local-a"); assert.throws(() => db.reserve(first.consentPayload), /ceiling/); }
  finally { db.close(); }
});
