import nodeTest, { type TestContext } from 'node:test';
import { postgresFixture } from './relationship-storage-fixtures.ts';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { RecipientRelationships, RelationshipError, type RelationshipSession } from '../src/core/recipient-relationships.ts';
// Local signing keys and private records are test fixtures, not Mainnet writes,
// real people, independently confirmed identities or live wallet demonstrations.
for (const backend of ['sqlite', ...(process.env.TEST_DATABASE_URL ? ['postgres'] : [])]) {
const test = (name: string, fn: (t: TestContext) => Promise<void>) => nodeTest(backend + ': ' + name, fn);
const openStore = (path: string, origin: string) => backend === 'postgres' ? RecipientRelationships.connect(path, origin, true) : RecipientRelationships.open(path, origin);
const origin = 'http://127.0.0.1:8787';
async function setup(t: {
    after: (fn: () => Promise<void>) => void;
}) {
    const dir = await mkdtemp(join(tmpdir(), 'veyra-private-'));
    const fixture = backend === 'postgres' ? await postgresFixture() : null;
    const path = fixture?.url || join(dir, 'contacts.sqlite');
    const db = await openStore(path, origin);
    t.after(async () => { try {
        await db.close();
    }
    catch { } await fixture?.dispose(); await rm(dir, { recursive: true, force: true }); });
    return { db, path };
}
async function login(db: RecipientRelationships, key = Ed25519Keypair.generate()) {
    const challenge = await db.issueLogin(key.toSuiAddress());
    const signed = await key.signPersonalMessage(new TextEncoder().encode(challenge.message));
    const result = await db.completeLogin(challenge.nonce, challenge.binding, signed.signature);
    return { ...result, key, challenge };
}
function bearer(url: string) { return new URLSearchParams(new URL(url).hash.slice(1)).get('invite')!; }
async function propose(db: RecipientRelationships, payer: RelationshipSession, recipient: Awaited<ReturnType<typeof login>>, label = 'John — private supplier', relationshipId?: string) {
    const invitation = await db.createInvitation(payer, { label, relationshipId });
    const prepared = await db.prepareRecipient(recipient.session, bearer(invitation.invitationUrl));
    const signed = await recipient.key.signPersonalMessage(new TextEncoder().encode(prepared.message));
    const claim = await db.confirmRecipient(recipient.session, prepared.nonce, signed.signature);
    return { invitation, prepared, claim };
}
function acceptance(claim: Awaited<ReturnType<typeof propose>>['claim']) {
    return {
        relationshipId: claim.relationshipId, claimId: claim.claimId, code: claim.verificationCode,
        expectedAddress: claim.receivingAddress, method: 'known_phone_call', independentlyConfirmed: true,
    };
}
const status = (expected: number) => (error: unknown) => error instanceof RelationshipError && error.status === expected;
test('M3: genuine local wallet signature creates a browser-bound, revocable session', async (t) => {
    const { db } = await setup(t), key = Ed25519Keypair.generate();
    const challenge = await db.issueLogin(key.toSuiAddress());
    assert.match(challenge.message, /authenticate this browser only/);
    assert.match(challenge.message, /Origin: http:\/\/127.0.0.1:8787/);
    const signed = await key.signPersonalMessage(new TextEncoder().encode(challenge.message));
    await assert.rejects(db.completeLogin(challenge.nonce, 'A'.repeat(43), signed.signature), status(401));
    const result = await db.completeLogin(challenge.nonce, challenge.binding, signed.signature);
    assert.equal(result.session.address, key.toSuiAddress());
    assert.equal((await db.authenticate(result.rawToken))?.address, key.toSuiAddress());
    db.checkCsrf(result.session, result.session.csrfToken);
    await assert.rejects(async () => db.checkCsrf(result.session, 'B'.repeat(43)), status(403));
    await assert.rejects(db.completeLogin(challenge.nonce, challenge.binding, signed.signature), status(401));
    await db.logout(result.session);
    assert.equal(await db.authenticate(result.rawToken), null);
    await assert.rejects(async () => await db.createInvitation(result.session, { label: 'No access' }), status(401));
});
test('M3: invalid signatures consume login nonces; expired challenges never authenticate', async (t) => {
    const { db } = await setup(t), first = Ed25519Keypair.generate(), other = Ed25519Keypair.generate();
    const c = await db.issueLogin(first.toSuiAddress()), wrong = await other.signPersonalMessage(new TextEncoder().encode(c.message));
    await assert.rejects(db.completeLogin(c.nonce, c.binding, wrong.signature), status(401));
    const right = await first.signPersonalMessage(new TextEncoder().encode(c.message));
    await assert.rejects(db.completeLogin(c.nonce, c.binding, right.signature), status(401));
    const old = await db.issueLogin(first.toSuiAddress(), Date.now() - 300001);
    const signed = await first.signPersonalMessage(new TextEncoder().encode(old.message));
    await assert.rejects(db.completeLogin(old.nonce, old.binding, signed.signature), status(401));
});
test('M3/M4: invitation, signed receiving intent and payer acceptance form one private journey', async (t) => {
    const { db } = await setup(t), payer = await login(db), recipient = await login(db);
    const flow = await propose(db, payer.session, recipient);
    assert.ok(!JSON.stringify(flow.prepared).includes('John'));
    assert.equal(flow.prepared.candidate.receivingAddress, recipient.session.address);
    assert.equal(flow.prepared.candidate.relationshipId, flow.invitation.relationshipId);
    assert.match(flow.prepared.message, /Exact private record SHA-256/);
    assert.equal(flow.claim.memoryWritten, false);
    assert.equal(flow.claim.identityVerified, false);
    assert.equal((await db.assess(payer.session, flow.claim.relationshipId, recipient.session.address)).status, 'recipient_confirmation_pending');
    const listing = await db.list(payer.session);
    assert.equal(listing[0].label, 'John — private supplier');
    assert.ok(!JSON.stringify(listing).includes(flow.claim.verificationCode));
    const accepted = await db.accept(payer.session, acceptance(flow.claim));
    assert.equal(accepted.status, 'recipient_relationship_confirmed_by_you');
    assert.equal(accepted.identityVerified, false);
    const assessment = await db.assess(payer.session, flow.claim.relationshipId, recipient.session.address);
    assert.equal(assessment.status, 'matches_relationship_confirmation');
    assert.equal(assessment.paymentAuthorized, false);
    assert.equal(assessment.source, 'private_payer_confirmed_relationship');
    assert.equal(assessment.memoryWritten, false);
    assert.equal((await db.assess(payer.session, flow.claim.relationshipId, '0x2')).status, 'differs_from_relationship_confirmation');
    assert.deepEqual((await db.history(payer.session, flow.claim.relationshipId)).map(e => e.event), ['invitation_created', 'recipient_signed', 'payer_confirmed_out_of_band']);
    assert.equal((await db.received(recipient.session))[0].verificationCode, flow.claim.verificationCode);
});
test('M3: knowing a contact ID or using the same label grants no cross-payer access', async (t) => {
    const { db } = await setup(t), payer = await login(db), stranger = await login(db), recipient = await login(db);
    const flow = await propose(db, payer.session, recipient);
    assert.deepEqual(await db.list(stranger.session), []);
    await assert.rejects(async () => await db.assess(stranger.session, flow.claim.relationshipId, recipient.session.address), status(404));
    await assert.rejects(async () => await db.accept(stranger.session, acceptance(flow.claim)), status(404));
    await assert.rejects(async () => await db.createInvitation(stranger.session, { relationshipId: flow.claim.relationshipId }), status(404));
    await assert.rejects(async () => await db.history(stranger.session, flow.claim.relationshipId), status(404));
    await assert.rejects(async () => await db.revoke(stranger.session, flow.claim.relationshipId), status(404));
    const different = await db.createInvitation(stranger.session, { label: 'John — private supplier' });
    assert.notEqual(different.relationshipId, flow.claim.relationshipId);
    assert.deepEqual(await db.received(stranger.session), []);
});
test('M3: signature or checkbox alone cannot accept a relationship', async (t) => {
    const { db } = await setup(t), payer = await login(db), recipient = await login(db), flow = await propose(db, payer.session, recipient);
    const valid = acceptance(flow.claim);
    await assert.rejects(async () => await db.accept(payer.session, { ...valid, independentlyConfirmed: false }), status(400));
    await assert.rejects(async () => await db.accept(payer.session, { ...valid, method: 'new_contact_from_payment_request' }), status(400));
    await assert.rejects(async () => await db.accept(payer.session, { ...valid, code: '0000-0000-0000' }), status(400));
    await assert.rejects(async () => await db.accept(payer.session, { ...valid, expectedAddress: '0x3' }), status(400));
    assert.equal((await db.list(payer.session))[0].acceptedAddress, null);
    await db.accept(payer.session, valid);
    await assert.rejects(async () => await db.accept(payer.session, valid), status(409));
});
test('M3: invitation and recipient confirmation are single-use even under concurrent replay', async (t) => {
    const { db } = await setup(t), payer = await login(db), recipient = await login(db), invite = await db.createInvitation(payer.session, { label: 'Private contact' });
    const prepared = await db.prepareRecipient(recipient.session, bearer(invite.invitationUrl));
    const signed = await recipient.key.signPersonalMessage(new TextEncoder().encode(prepared.message));
    const results = await Promise.allSettled([db.confirmRecipient(recipient.session, prepared.nonce, signed.signature), db.confirmRecipient(recipient.session, prepared.nonce, signed.signature)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    await assert.rejects(async () => await db.prepareRecipient(recipient.session, bearer(invite.invitationUrl)), status(404));
});
test('M3: receiving statement is bound to the authenticated signing wallet', async (t) => {
    const { db } = await setup(t), payer = await login(db), recipient = await login(db), attacker = await login(db);
    const invite = await db.createInvitation(payer.session, { label: 'Recipient' }), prepared = await db.prepareRecipient(recipient.session, bearer(invite.invitationUrl));
    const signed = await attacker.key.signPersonalMessage(new TextEncoder().encode(prepared.message));
    await assert.rejects(db.confirmRecipient(attacker.session, prepared.nonce, signed.signature), status(409));
    await assert.rejects(db.confirmRecipient(recipient.session, prepared.nonce, signed.signature), status(401));
    assert.equal((await db.list(payer.session))[0].pendingClaim, null);
});
test('M3/M4: a changed address cannot replace accepted history without fresh payer confirmation', async (t) => {
    const { db } = await setup(t), payer = await login(db), first = await login(db), second = await login(db);
    const initial = await propose(db, payer.session, first);
    await db.accept(payer.session, acceptance(initial.claim));
    const change = await propose(db, payer.session, second, 'unused label', initial.claim.relationshipId);
    assert.equal((await db.assess(payer.session, initial.claim.relationshipId, first.session.address)).status, 'recipient_confirmation_pending');
    assert.equal((await db.list(payer.session))[0].acceptedAddress, first.session.address);
    await db.accept(payer.session, acceptance(change.claim));
    assert.equal((await db.assess(payer.session, change.claim.relationshipId, first.session.address)).status, 'differs_from_relationship_confirmation');
    assert.deepEqual((await db.assess(payer.session, change.claim.relationshipId, second.session.address)).priorAddresses, [first.session.address, second.session.address]);
    await db.revoke(payer.session, change.claim.relationshipId);
    assert.equal((await db.assess(payer.session, change.claim.relationshipId, second.session.address)).status, 'relationship_revoked');
});
test('M3: reissuing an invitation cancels old unfinished links and prevents stale acceptance', async (t) => {
    const { db } = await setup(t), payer = await login(db), recipient = await login(db);
    const old = await propose(db, payer.session, recipient);
    await db.createInvitation(payer.session, { relationshipId: old.claim.relationshipId });
    await assert.rejects(async () => await db.accept(payer.session, acceptance(old.claim)), status(409));
    await assert.rejects(async () => await db.prepareRecipient(recipient.session, bearer(old.invitation.invitationUrl)), status(404));
});
test('M3: sessions, single-use nonces and private relationship evidence survive restart', async (t) => {
    const { db, path } = await setup(t), payer = await login(db), recipient = await login(db);
    const flow = await propose(db, payer.session, recipient);
    await db.accept(payer.session, acceptance(flow.claim));
    await db.close();
    const reopened = await openStore(path, origin);
    try {
        const restored = (await reopened.authenticate(payer.rawToken))!;
        assert.equal(restored.csrfToken, payer.session.csrfToken);
        assert.equal((await reopened.list(restored))[0].acceptedAddress, recipient.session.address);
        await assert.rejects(reopened.completeLogin(payer.challenge.nonce, payer.challenge.binding, 'invalid'), status(401));
        assert.equal(await reopened.authenticate(payer.rawToken, Date.now() + 3600001), null);
        await reopened.logout(restored);
        assert.equal(await reopened.authenticate(payer.rawToken), null);
    }
    finally {
        await reopened.close();
    }
});
test('M3: verification-code guessing is durably limited', async (t) => {
    const { db } = await setup(t), payer = await login(db), recipient = await login(db), flow = await propose(db, payer.session, recipient);
    for (let i = 0; i < 8; i++)
        await assert.rejects(async () => await db.accept(payer.session, { ...acceptance(flow.claim), code: '0000-0000-0000' }), status(400));
    await assert.rejects(async () => await db.accept(payer.session, acceptance(flow.claim)), status(429));
});
test('M3: domain-bound login challenges and private contacts cannot cross origins', async (t) => {
    const { db, path } = await setup(t), payer = await login(db), recipient = await login(db);
    const invitation = await db.createInvitation(payer.session, { label: 'Private to the original service' });
    const challenge = await db.issueLogin(payer.key.toSuiAddress());
    const signed = await payer.key.signPersonalMessage(new TextEncoder().encode(challenge.message));
    const other = await openStore(path, 'https://other.example');
    try {
        await assert.rejects(other.completeLogin(challenge.nonce, challenge.binding, signed.signature), status(401));
        assert.equal(await other.authenticate(payer.rawToken), null);
        const alternate = await login(other, payer.key);
        assert.deepEqual(await other.list(alternate.session), []);
        await assert.rejects(async () => await other.prepareRecipient(alternate.session, bearer(invitation.invitationUrl)), status(404));
    }
    finally {
        await other.close();
    }
});

if (backend === 'postgres') test('M3: distinct PostgreSQL service connections share nonce consumption and revocation', async t => {
 const {db,path}=await setup(t),payer=await login(db),recipient=await login(db);
 const second=await openStore(path,origin);
 try {
  const invitation=await db.createInvitation(payer.session,{label:'Concurrent private contact'});
  const draft=await db.prepareRecipient(recipient.session,bearer(invitation.invitationUrl));
  const signed=await recipient.key.signPersonalMessage(new TextEncoder().encode(draft.message));
  const outcomes=await Promise.allSettled([db.confirmRecipient(recipient.session,draft.nonce,signed.signature),second.confirmRecipient(recipient.session,draft.nonce,signed.signature)]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  const restored=(await second.authenticate(payer.rawToken))!;
  assert.equal(restored.csrfToken,payer.session.csrfToken);
  await second.logout(restored);
  assert.equal(await db.authenticate(payer.rawToken),null);
  await assert.rejects(db.createInvitation(payer.session,{label:'Must fail'}),status(401));
 } finally {await second.close();}
});
}
