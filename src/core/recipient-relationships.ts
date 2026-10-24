import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync, existsSync, lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { normalizeSuiAddress } from "./recipient-check.ts";

const LOGIN_TTL = 5 * 60_000, SESSION_TTL = 60 * 60_000, INVITE_TTL = 24 * 60 * 60_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
type Row = Record<string, any>;
export class RelationshipError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function requireValue(ok: unknown, status: number, message: string): asserts ok {
  if (!ok) throw new RelationshipError(status, message);
}
function token(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value); }
function id(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9-]{36}$/.test(value); }
function signature(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 2048; }
export type RelationshipSession = { address: string; sessionHash: string; expiresAt: number; csrfToken: string };
export type RelationshipAssessment = {
  relationshipId: string; label: string; status: string; message: string;
  acceptedAddress: string | null; proposedAddress: string; priorAddresses: string[];
  acceptedAt: string | null; confirmationMethod: string | null; pendingChange: boolean;
  source: "private_payer_confirmed_relationship"; memoryWritten: false;
  identityVerified: false; paymentAuthorized: false; action: "manual_review_required";
};

/** Private, single-host SQLite state. No method publishes to Walrus or signs a payment. */
export class RecipientRelationships {
  private db: DatabaseSync;
  private origin: string;
  private csrfKey: string;
  constructor(path: string, origin: string) {
    const url = new URL(origin);
    requireValue(url.origin === origin && (url.protocol === "https:" ||
      (url.protocol === "http:" && url.hostname === "127.0.0.1")), 503, "Explicit secure service origin required");
    requireValue(path && path !== ":memory:", 503, "Private persistent relationship database required");
    const resolved = resolve(path); mkdirSync(dirname(resolved), { recursive: true, mode: 0o700 });
    if (existsSync(resolved)) requireValue(lstatSync(resolved).isFile() && !lstatSync(resolved).isSymbolicLink(), 503, "Regular database file required");
    this.origin = origin; this.db = new DatabaseSync(resolved); chmodSync(resolved, 0o600);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rel_settings(k TEXT PRIMARY KEY,v TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS rel_login(nonce TEXT PRIMARY KEY,address TEXT NOT NULL,binding TEXT NOT NULL,
        message TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0) STRICT;
      CREATE TABLE IF NOT EXISTS rel_sessions(token_hash TEXT PRIMARY KEY,address TEXT NOT NULL,origin TEXT NOT NULL,
        expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0) STRICT;
      CREATE TABLE IF NOT EXISTS rel_contacts(id TEXT PRIMARY KEY,payer TEXT NOT NULL,origin TEXT NOT NULL,label TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'active',accepted_claim TEXT,created INTEGER NOT NULL) STRICT;
      CREATE INDEX IF NOT EXISTS rel_contacts_payer ON rel_contacts(payer);
      CREATE TABLE IF NOT EXISTS rel_invites(id TEXT PRIMARY KEY,relationship_id TEXT NOT NULL REFERENCES rel_contacts(id),
        token_hash TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'open',created INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS rel_drafts(nonce TEXT PRIMARY KEY,invitation_id TEXT NOT NULL REFERENCES rel_invites(id),
        session_hash TEXT NOT NULL,address TEXT NOT NULL,record TEXT NOT NULL,record_hash TEXT NOT NULL,
        message TEXT NOT NULL,code TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0) STRICT;
      CREATE TABLE IF NOT EXISTS rel_claims(id TEXT PRIMARY KEY,relationship_id TEXT NOT NULL REFERENCES rel_contacts(id),
        invitation_id TEXT UNIQUE NOT NULL REFERENCES rel_invites(id),recipient TEXT NOT NULL,record TEXT NOT NULL,
        record_hash TEXT NOT NULL,signature TEXT NOT NULL,message TEXT NOT NULL,code TEXT NOT NULL,created INTEGER NOT NULL,
        accepted INTEGER,method TEXT) STRICT;
      CREATE TABLE IF NOT EXISTS rel_audit(id TEXT PRIMARY KEY,relationship_id TEXT NOT NULL,actor TEXT NOT NULL,
        event TEXT NOT NULL,claim_id TEXT,created INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS rel_limits(k TEXT PRIMARY KEY,start INTEGER NOT NULL,n INTEGER NOT NULL) STRICT;
    `);
    this.db.prepare("INSERT OR IGNORE INTO rel_settings VALUES('schema','1')").run();
    requireValue(this.db.prepare("SELECT v FROM rel_settings WHERE k='schema'").get()?.v === "1", 503, "Unsupported relationship schema");
    requireValue(this.db.prepare("PRAGMA quick_check").get()?.quick_check === "ok", 503, "Relationship database integrity failure");
    this.db.prepare("INSERT OR IGNORE INTO rel_settings VALUES('csrf_key',?)").run(secret());
    this.csrfKey = String(this.db.prepare("SELECT v FROM rel_settings WHERE k='csrf_key'").get()!.v);
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value = fn(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private limit(key: string, maximum: number, now: number, period = 60_000): void {
    const row = this.db.prepare("SELECT * FROM rel_limits WHERE k=?").get(key) as Row | undefined;
    if (!row || now - row.start >= period) this.db.prepare("INSERT OR REPLACE INTO rel_limits VALUES(?,?,1)").run(key, now);
    else {
      requireValue(row.n < maximum, 429, "Private confirmation request limit reached");
      this.db.prepare("UPDATE rel_limits SET n=n+1 WHERE k=?").run(key);
    }
  }
  private audit(relationshipId: string, actor: string, event: string, claimId: string | null, now: number) {
    this.db.prepare("INSERT INTO rel_audit VALUES(?,?,?,?,?,?)").run(randomUUID(), relationshipId, actor, event, claimId, now);
  }
  issueLogin(address: string, now = Date.now()) {
    const normalized = normalizeSuiAddress(address), nonce = secret(), binding = secret();
    const message = ["Veyra private recipient relationships sign-in", "Origin: " + this.origin,
      "Network: Sui Mainnet", "Purpose: authenticate this browser only; no publication or payment authorization.",
      "Address: " + normalized, "Nonce: " + nonce, "Issued at: " + new Date(now).toISOString(),
      "Expires at: " + new Date(now + LOGIN_TTL).toISOString()].join("\n");
    this.transaction(() => {
      this.db.prepare("DELETE FROM rel_login WHERE expires<=?").run(now);
      this.db.prepare("DELETE FROM rel_sessions WHERE expires<=? OR revoked=1").run(now);
      this.limit("login-global", 120, now);
      this.limit("login:" + normalized, 8, now);
      requireValue(Number(this.db.prepare("SELECT count(*) AS n FROM rel_login WHERE used=0").get()!.n) < 200, 429, "Too many login challenges");
      this.db.prepare("INSERT INTO rel_login(nonce,address,binding,message,expires) VALUES(?,?,?,?,?)")
        .run(nonce, normalized, hash(binding), message, now + LOGIN_TTL);
    });
    return { nonce, binding, address: normalized, message, expiresAt: now + LOGIN_TTL };
  }
  async completeLogin(nonce: string, binding: string, signed: string, oldSession?: string, now = Date.now()) {
    requireValue(token(nonce) && token(binding) && signature(signed), 400, "Invalid login proof");
    const login = this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM rel_login WHERE nonce=?").get(nonce) as Row | undefined;
      requireValue(row && !row.used && row.expires > now && row.message.split("\n")[1] === "Origin: " + this.origin && equal(row.binding, hash(binding)), 401, "Login challenge expired, consumed or browser mismatch");
      this.db.prepare("UPDATE rel_login SET used=1 WHERE nonce=?").run(nonce); return row;
    });
    try { await verifyPersonalMessageSignature(new TextEncoder().encode(login.message), signed, { address: login.address }); }
    catch { throw new RelationshipError(401, "Wallet signature verification failed"); }
    requireValue(login.expires > Date.now(), 401, "Login challenge expired during verification");
    const rawToken = secret();
    this.transaction(() => {
      if (oldSession && token(oldSession)) this.db.prepare("UPDATE rel_sessions SET revoked=1 WHERE token_hash=?").run(hash(oldSession));
      this.db.prepare("INSERT INTO rel_sessions(token_hash,address,origin,expires) VALUES(?,?,?,?)")
        .run(hash(rawToken), login.address, this.origin, now + SESSION_TTL);
    });
    return { rawToken, session: this.authenticate(rawToken, now)! };
  }
  authenticate(rawToken: string | undefined, now = Date.now()): RelationshipSession | null {
    if (!token(rawToken)) return null;
    const row = this.db.prepare("SELECT * FROM rel_sessions WHERE token_hash=? AND origin=? AND revoked=0 AND expires>?")
      .get(hash(rawToken), this.origin, now) as Row | undefined;
    if (!row) return null;
    return { address: row.address, sessionHash: row.token_hash, expiresAt: row.expires,
      csrfToken: createHmac("sha256", this.csrfKey).update(rawToken).digest("base64url") };
  }
  checkCsrf(session: RelationshipSession, csrf: unknown): void {
    requireValue(token(csrf) && equal(csrf, session.csrfToken), 403, "Valid browser CSRF token required");
  }
  logout(session: RelationshipSession): void {
    this.db.prepare("UPDATE rel_sessions SET revoked=1 WHERE token_hash=?").run(session.sessionHash);
  }
  private liveSession(session: RelationshipSession, now: number): void {
    requireValue(this.db.prepare("SELECT 1 FROM rel_sessions WHERE token_hash=? AND address=? AND origin=? AND revoked=0 AND expires>?")
      .get(session.sessionHash, session.address, this.origin, now), 401, "Session expired or revoked");
  }
  private contact(payer: string, relationshipId: string): Row {
    requireValue(id(relationshipId), 404, "Private contact not found");
    const row = this.db.prepare("SELECT * FROM rel_contacts WHERE id=? AND payer=? AND origin=?").get(relationshipId, payer, this.origin) as Row | undefined;
    requireValue(row, 404, "Private contact not found"); return row;
  }
  createInvitation(session: RelationshipSession, input: { label?: string; relationshipId?: string }, now = Date.now()) {
    const bearer = secret(), invitationId = randomUUID();
    return this.transaction(() => {
      this.liveSession(session, now); this.limit("invite:" + session.address, 20, now, 86400000);
      let relationshipId = input.relationshipId;
      if (!relationshipId) {
        requireValue(typeof input.label === "string" && input.label.trim().length > 0 &&
          input.label.trim().length <= 80 && !/[\u0000-\u001f\u007f]/.test(input.label), 400, "Private contact label must contain 1–80 characters");
        requireValue(Number(this.db.prepare("SELECT count(*) AS n FROM rel_contacts WHERE payer=?").get(session.address)!.n) < 1000, 429, "Private contact limit reached");
        relationshipId = randomUUID();
        this.db.prepare("INSERT INTO rel_contacts(id,payer,origin,label,created) VALUES(?,?,?,?,?)")
          .run(relationshipId, session.address, this.origin, input.label.trim(), now);
      }
      const relationship = this.contact(session.address, relationshipId);
      requireValue(relationship.state === "active", 409, "Contact was revoked");
      // Reissuing an invitation cancels unfinished invites, never accepted history.
      this.db.prepare("UPDATE rel_invites SET state='cancelled' WHERE relationship_id=? AND state IN ('open','claimed')").run(relationshipId);
      this.db.prepare("INSERT INTO rel_invites(id,relationship_id,token_hash,expires,created) VALUES(?,?,?,?,?)")
        .run(invitationId, relationshipId, hash(bearer), now + INVITE_TTL, now);
      this.audit(relationshipId, session.address, "invitation_created", null, now);
      return { relationshipId, invitationId, invitationUrl: this.origin + "/verify-wallet#invite=" + bearer,
        expiresAt: now + INVITE_TTL, label: relationship.label, memoryWritten: false, paymentAuthorized: false };
    });
  }
  prepareRecipient(session: RelationshipSession, bearer: string, now = Date.now()) {
    requireValue(token(bearer), 404, "Invitation unavailable");
    return this.transaction(() => {
      this.liveSession(session, now); this.limit("claim-prepare:" + session.address, 12, now);
      const invite = this.db.prepare("SELECT i.*,c.payer,c.state AS contact_state FROM rel_invites i JOIN rel_contacts c ON c.id=i.relationship_id WHERE i.token_hash=? AND c.origin=?")
        .get(hash(bearer), this.origin) as Row | undefined;
      requireValue(invite && invite.state === "open" && invite.contact_state === "active" && invite.expires > now, 404, "Invitation unavailable or expired");
      const nonce = secret(), expiresAt = Math.min(invite.expires, now + LOGIN_TTL);
      const code = randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g)!.join("-");
      const candidate = { type: "veyra.private_recipient_confirmation.v1", network: "sui-mainnet",
        origin: this.origin, relationshipId: invite.relationship_id, invitationId: invite.id,
        payerAddress: invite.payer, receivingAddress: session.address, verificationCode: code,
        nonce, issuedAt: new Date(now).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
        intent: "I intend to receive funds at this address for this specific private relationship.",
        identityVerified: false, paymentAuthorized: false, memoryWritten: false };
      const record = JSON.stringify(candidate), recordHash = hash(record);
      const message = ["Veyra private receiving-address confirmation", "Origin: " + this.origin,
        "Network: Sui Mainnet", "Relationship: " + invite.relationship_id, "Invitation: " + invite.id,
        "Payer wallet: " + invite.payer, "Receiving wallet: " + session.address,
        "Exact private record SHA-256: " + recordHash, "Verification code: " + code,
        "Nonce: " + nonce, "Expires at: " + candidate.expiresAt,
        candidate.intent, "Private confirmation only. No Walrus publication, identity proof or payment authorization."].join("\n");
      this.db.prepare("DELETE FROM rel_drafts WHERE expires<=? OR (invitation_id=? AND used=0)").run(now, invite.id);
      this.db.prepare("INSERT INTO rel_drafts(nonce,invitation_id,session_hash,address,record,record_hash,message,code,expires) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(nonce, invite.id, session.sessionHash, session.address, record, recordHash, message, code, expiresAt);
      return { nonce, candidate, recordHash, message, verificationCode: code, expiresAt,
        memoryWritten: false, paymentAuthorized: false };
    });
  }
  async confirmRecipient(session: RelationshipSession, nonce: string, signed: string, now = Date.now()) {
    requireValue(token(nonce) && signature(signed), 400, "Invalid recipient confirmation");
    const draft = this.transaction(() => {
      this.liveSession(session, now);
      const row = this.db.prepare("SELECT * FROM rel_drafts WHERE nonce=? AND session_hash=? AND address=?")
        .get(nonce, session.sessionHash, session.address) as Row | undefined;
      requireValue(row && !row.used && row.expires > now, 409, "Confirmation expired, consumed or session mismatch");
      this.db.prepare("UPDATE rel_drafts SET used=1 WHERE nonce=?").run(nonce); return row;
    });
    try { await verifyPersonalMessageSignature(new TextEncoder().encode(draft.message), signed, { address: session.address }); }
    catch { throw new RelationshipError(401, "Receiving-wallet signature verification failed"); }
    return this.transaction(() => {
      this.liveSession(session, Date.now());
      const invite = this.db.prepare("SELECT i.*,c.state AS contact_state FROM rel_invites i JOIN rel_contacts c ON c.id=i.relationship_id WHERE i.id=?")
        .get(draft.invitation_id) as Row | undefined;
      requireValue(invite && invite.state === "open" && invite.contact_state === "active" && invite.expires > Date.now() && draft.expires > Date.now(), 409, "Invitation no longer accepts confirmations");
      const claimId = randomUUID();
      this.db.prepare("INSERT INTO rel_claims(id,relationship_id,invitation_id,recipient,record,record_hash,signature,message,code,created) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(claimId, invite.relationship_id, invite.id, session.address, draft.record, draft.record_hash, signed, draft.message, draft.code, now);
      this.db.prepare("UPDATE rel_invites SET state='claimed' WHERE id=?").run(invite.id);
      this.audit(invite.relationship_id, session.address, "recipient_signed", claimId, now);
      return { relationshipId: invite.relationship_id, claimId, receivingAddress: session.address,
        verificationCode: draft.code, recordHash: draft.record_hash, status: "awaiting_payer_confirmation",
        memoryWritten: false, identityVerified: false, paymentAuthorized: false };
    });
  }
  received(session: RelationshipSession, now = Date.now()) {
    this.liveSession(session, now);
    return this.db.prepare(`SELECT c.id,c.relationship_id,c.recipient,c.code,c.record_hash,c.created,c.accepted,
      r.payer,i.state,i.expires FROM rel_claims c JOIN rel_contacts r ON r.id=c.relationship_id
      JOIN rel_invites i ON i.id=c.invitation_id WHERE c.recipient=? AND r.origin=? ORDER BY c.created DESC LIMIT 50`)
      .all(session.address, this.origin).map(row=>({claimId:row.id,relationshipId:row.relationship_id,receivingAddress:row.recipient,
        verificationCode:row.code,recordHash:row.record_hash,payerAddress:row.payer,createdAt:row.created,
        status:row.state==='claimed'&&Number(row.expires)<=now?'expired':row.state,acceptedAt:row.accepted,memoryWritten:false,paymentAuthorized:false}));
  }
  list(session: RelationshipSession, now = Date.now()) {
    this.liveSession(session, now);
    return this.db.prepare("SELECT * FROM rel_contacts WHERE payer=? AND origin=? ORDER BY created DESC LIMIT 1000").all(session.address, this.origin).map(row => {
      const accepted = row.accepted_claim ? this.db.prepare("SELECT recipient,accepted,method FROM rel_claims WHERE id=?").get(row.accepted_claim) : null;
      const pending = this.db.prepare(`SELECT c.id,c.recipient,c.record_hash,c.created,i.expires FROM rel_claims c
        JOIN rel_invites i ON i.id=c.invitation_id WHERE c.relationship_id=? AND i.state='claimed' AND i.expires>? ORDER BY c.created DESC LIMIT 1`).get(row.id, now);
      return { id: row.id, label: row.label, state: row.state, acceptedAddress: accepted?.recipient || null,
        acceptedAt: accepted?.accepted || null, confirmationMethod: accepted?.method || null,
        pendingClaim: pending ? { id: pending.id, receivingAddress: pending.recipient, recordHash: pending.record_hash, createdAt: pending.created, expiresAt: pending.expires } : null };
    });
  }
  accept(session: RelationshipSession, input: { relationshipId: string; claimId: string; code: string;
    expectedAddress: string; method: string; independentlyConfirmed: boolean }, now = Date.now()) {
    requireValue(input.independentlyConfirmed === true && ["established_chat", "known_phone_call", "in_person"].includes(input.method), 400, "Independent trusted-channel confirmation required");
    requireValue(id(input.claimId) && typeof input.code === "string" && /^[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}$/.test(input.code), 400, "Ask the recipient for their verification code");
    const expected = normalizeSuiAddress(input.expectedAddress);
    // Commit failed attempts as well as successful ones, so guessing is bounded.
    this.transaction(() => { this.liveSession(session, now); this.limit("accept:" + session.address, 8, now); });
    return this.transaction(() => {
      const relationship = this.contact(session.address, input.relationshipId);
      requireValue(relationship.state === "active", 409, "Contact was revoked");
      const claim = this.db.prepare("SELECT c.*,i.state AS invitation_state,i.expires FROM rel_claims c JOIN rel_invites i ON i.id=c.invitation_id WHERE c.id=? AND c.relationship_id=?")
        .get(input.claimId, relationship.id) as Row | undefined;
      requireValue(claim && claim.invitation_state === "claimed" && claim.expires > now, 409, "Recipient confirmation unavailable or expired");
      requireValue(claim.recipient === expected && equal(claim.code, input.code.toUpperCase()), 400, "Address or verification code does not match; confirm through your trusted channel");
      this.db.prepare("UPDATE rel_claims SET accepted=?,method=? WHERE id=?").run(now, input.method, claim.id);
      this.db.prepare("UPDATE rel_contacts SET accepted_claim=? WHERE id=?").run(claim.id, relationship.id);
      this.db.prepare("UPDATE rel_invites SET state='accepted' WHERE id=?").run(claim.invitation_id);
      this.audit(relationship.id, session.address, "payer_confirmed_out_of_band", claim.id, now);
      return { relationshipId: relationship.id, status: "recipient_relationship_confirmed_by_you", receivingAddress: expected,
        confirmationMethod: input.method, identityVerified: false, memoryWritten: false, paymentAuthorized: false };
    });
  }
  revoke(session: RelationshipSession, relationshipId: string, now = Date.now()) {
    return this.transaction(() => {
      this.liveSession(session, now); const contact = this.contact(session.address, relationshipId);
      this.db.prepare("UPDATE rel_contacts SET state='revoked' WHERE id=?").run(contact.id);
      this.db.prepare("UPDATE rel_invites SET state='cancelled' WHERE relationship_id=? AND state IN ('open','claimed')").run(contact.id);
      this.audit(contact.id, session.address, "relationship_revoked", null, now);
      return { status: "revoked", paymentAuthorized: false };
    });
  }
  assess(session: RelationshipSession, relationshipId: string, proposed: string, now = Date.now()): RelationshipAssessment {
    this.liveSession(session, now); const contact = this.contact(session.address, relationshipId);
    const proposedAddress = normalizeSuiAddress(proposed);
    const accepted = contact.accepted_claim ? this.db.prepare("SELECT * FROM rel_claims WHERE id=?").get(contact.accepted_claim) as Row : null;
    const priorAddresses = [...new Set(this.db.prepare("SELECT recipient FROM rel_claims WHERE relationship_id=? AND accepted IS NOT NULL ORDER BY accepted,rowid")
      .all(contact.id).map(row => String(row.recipient)))];
    const pending = this.db.prepare("SELECT 1 FROM rel_invites WHERE relationship_id=? AND state='claimed' AND expires>?").get(contact.id, now);
    const status = contact.state === "revoked" ? "relationship_revoked" : pending ? "recipient_confirmation_pending" :
      !accepted ? "relationship_not_confirmed" : accepted.recipient === proposedAddress ? "matches_relationship_confirmation" : "differs_from_relationship_confirmation";
    const messages: Record<string, string> = {
      relationship_revoked: "You revoked this recipient relationship. Independently establish a new confirmation before paying.",
      recipient_confirmation_pending: "A recipient confirmation is awaiting your trusted-channel check. It has not replaced any accepted address.",
      relationship_not_confirmed: "You have not independently accepted a receiving address for this contact.",
      matches_relationship_confirmation: "The address matches the private relationship you confirmed. This is not identity proof, current key control or payment authorization.",
      differs_from_relationship_confirmation: "The address differs from the receiving address you confirmed for this private contact. Stop and independently verify the change.",
    };
    return { relationshipId: contact.id, label: contact.label, status, message: messages[status], acceptedAddress: accepted?.recipient || null,
      proposedAddress, priorAddresses, acceptedAt: accepted ? new Date(accepted.accepted).toISOString() : null,
      confirmationMethod: accepted?.method || null, pendingChange: Boolean(pending), source: "private_payer_confirmed_relationship",
      memoryWritten: false, identityVerified: false, paymentAuthorized: false, action: "manual_review_required" };
  }
  history(session: RelationshipSession, relationshipId: string, now = Date.now()) {
    this.liveSession(session, now); this.contact(session.address, relationshipId);
    return this.db.prepare("SELECT event,claim_id,created FROM rel_audit WHERE relationship_id=? ORDER BY rowid LIMIT 200").all(relationshipId);
  }
  close() { this.db.close(); }
}
