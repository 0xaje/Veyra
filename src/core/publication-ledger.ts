import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync, lstatSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PreparedPublications } from "./prepared-publication.ts";
import { buildPublicationConsentMessage, type PublicationConsentInput } from "./self-service-confirmation.ts";
import type { DurableStorageReceipt } from "./storage-safeguards.ts";

type Prepared = ReturnType<PreparedPublications["issue"]>;
export type PublicationJob = {
  nonce: string; address: string; counterpartyId: string; recordHash: string;
  idempotencyKey: string; phase: "reserved" | "submitting" | "pending" | "uncertain" | "stored";
  providerJobId: string | null; receipt: DurableStorageReceipt | null;
  reservedAt: number; updatedAt: number;
};
export type PublicationLedgerConfig = { maxDailyWritesPerWallet: number; maxGlobalDailyWrites: number };

/** Single-host durable state. All writers must use the SAME database file.
 * Independent files on multiple hosts are NOT a shared global budget.
 */
export class PublicationLedger {
  private db: DatabaseSync;
  private config: PublicationLedgerConfig;
  constructor(filePath: string, config: PublicationLedgerConfig) {
    for (const value of [config.maxDailyWritesPerWallet, config.maxGlobalDailyWrites])
      if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) throw new Error("Invalid publication write ceiling");
    if (!filePath || filePath === ":memory:") throw new Error("A durable publication database path is required");
    const path = resolve(filePath);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()))
      throw new Error("Publication database must be a regular file");
    this.config = config;
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
    const version = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (version.user_version !== 0 && version.user_version !== 1) throw new Error("Unsupported publication database version");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS preparations (
        nonce TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS publication_jobs (
        nonce TEXT PRIMARY KEY REFERENCES preparations(nonce),
        address TEXT NOT NULL, counterparty_id TEXT NOT NULL, record_hash TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE, phase TEXT NOT NULL
          CHECK(phase IN ('reserved','submitting','pending','uncertain','stored')),
        provider_job_id TEXT, receipt TEXT, reserved_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS publication_wallet ON publication_jobs(address);
      PRAGMA user_version=1;
    `);
    const check = this.db.prepare("PRAGMA quick_check").get() as { quick_check: string };
    if (check.quick_check !== "ok") throw new Error("Publication database integrity check failed");
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private parsePrepared(payload: string): Prepared {
    const prepared = JSON.parse(payload) as Prepared;
    if (prepared.consentMessage !== buildPublicationConsentMessage(prepared.consentPayload) ||
        createHash("sha256").update(prepared.candidateJson).digest("hex") !== prepared.recordHash ||
        prepared.recordHash !== prepared.consentPayload.recordHash ||
        JSON.stringify(prepared.candidate) !== prepared.candidateJson ||
        prepared.candidate.address !== prepared.consentPayload.address ||
        prepared.candidate.counterpartyId !== prepared.consentPayload.counterpartyId)
      throw new Error("Persisted publication binding is corrupt");
    return prepared;
  }
  issue(address: string, counterpartyId: string, now = Date.now()): Prepared {
    return this.transaction(() => {
      this.db.prepare("DELETE FROM preparations WHERE consumed=0 AND expires_at<=?").run(now);
      const count = this.db.prepare("SELECT count(*) AS n FROM preparations WHERE consumed=0").get() as { n: number };
      if (count.n >= 200) throw new Error("Too many outstanding publication preparations");
      const prepared = new PreparedPublications().issue(address, counterpartyId, now);
      this.db.prepare("INSERT INTO preparations(nonce,payload,expires_at) VALUES(?,?,?)")
        .run(prepared.consentPayload.nonce, JSON.stringify(prepared), Date.parse(prepared.consentPayload.expiresAt));
      return prepared;
    });
  }
  get(consent: PublicationConsentInput, now = Date.now()): Prepared | null {
    if (!consent || typeof consent.nonce !== "string") return null;
    const row = this.db.prepare("SELECT payload,expires_at FROM preparations WHERE nonce=?").get(consent.nonce) as
      { payload: string; expires_at: number } | undefined;
    if (!row || row.expires_at <= now) return null;
    const prepared = this.parsePrepared(row.payload);
    try { if (buildPublicationConsentMessage(consent) !== prepared.consentMessage) return null; }
    catch { return null; }
    return prepared;
  }
  private parseJob(row: Record<string, any>): PublicationJob {
    return {
      nonce: row.nonce, address: row.address, counterpartyId: row.counterparty_id,
      recordHash: row.record_hash, idempotencyKey: row.idempotency_key, phase: row.phase,
      providerJobId: row.provider_job_id, receipt: row.receipt ? JSON.parse(row.receipt) : null,
      reservedAt: row.reserved_at, updatedAt: row.updated_at,
    };
  }
  getJob(nonce: string): PublicationJob | null {
    const row = this.db.prepare("SELECT * FROM publication_jobs WHERE nonce=?").get(nonce);
    return row ? this.parseJob(row) : null;
  }
  reserve(consent: PublicationConsentInput, now = Date.now()): { created: boolean; job: PublicationJob } {
    return this.transaction(() => {
      const prepared = this.get(consent, now);
      if (!prepared) throw new Error("Publication preparation expired or changed");
      const existing = this.getJob(consent.nonce);
      if (existing) return { created: false, job: existing };
      const row = this.db.prepare("SELECT consumed FROM preparations WHERE nonce=?").get(consent.nonce) as { consumed: number };
      if (row.consumed) throw new Error("Publication consent already consumed");
      const dayStart = Date.parse(new Date(now).toISOString().slice(0,10) + "T00:00:00.000Z");
      // An unresolved older job still reserves capacity after day rollover.
      const where = "(reserved_at>=? OR phase!='stored')";
      const global = this.db.prepare("SELECT count(*) AS n FROM publication_jobs WHERE " + where).get(dayStart) as { n: number };
      const wallet = this.db.prepare("SELECT count(*) AS n FROM publication_jobs WHERE address=? AND " + where)
        .get(consent.address, dayStart) as { n: number };
      if (global.n >= this.config.maxGlobalDailyWrites) throw new Error("Global publication write ceiling reached");
      if (wallet.n >= this.config.maxDailyWritesPerWallet) throw new Error("Wallet publication write ceiling reached");
      const idempotencyKey = "veyra-publication-" + consent.nonce;
      this.db.prepare(`INSERT INTO publication_jobs
        (nonce,address,counterparty_id,record_hash,idempotency_key,phase,reserved_at,updated_at)
        VALUES(?,?,?,?,?,'reserved',?,?)`).run(
        consent.nonce, prepared.candidate.address, prepared.candidate.counterpartyId,
        prepared.recordHash, idempotencyKey, now, now);
      this.db.prepare("UPDATE preparations SET consumed=1 WHERE nonce=?").run(consent.nonce);
      return { created: true, job: this.getJob(consent.nonce)! };
    });
  }
  markSubmitting(nonce: string, now = Date.now()): boolean {
    return Number(this.db.prepare("UPDATE publication_jobs SET phase='submitting',updated_at=? WHERE nonce=? AND phase='reserved'")
      .run(now, nonce).changes) === 1;
  }
  markAccepted(nonce: string, providerJobId: string, now = Date.now()): void {
    if (typeof providerJobId !== "string" || !providerJobId.trim() || providerJobId.length > 256)
      throw new Error("Valid provider job ID required");
    const result = this.db.prepare(`UPDATE publication_jobs SET phase='pending',provider_job_id=?,updated_at=?
      WHERE nonce=? AND phase IN ('submitting','pending','uncertain')
      AND (provider_job_id IS NULL OR provider_job_id=?)`).run(providerJobId, now, nonce, providerJobId);
    if (Number(result.changes) !== 1) throw new Error("Publication job acceptance conflict");
  }
  markUncertain(nonce: string, now = Date.now()): void {
    this.db.prepare("UPDATE publication_jobs SET phase='uncertain',updated_at=? WHERE nonce=? AND phase!='stored'").run(now, nonce);
  }
  complete(nonce: string, providerJobId: string, blobId: string, now = Date.now()): DurableStorageReceipt {
    if (typeof blobId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(blobId)) throw new Error("Durable blob ID required");
    return this.transaction(() => {
      const job = this.getJob(nonce);
      if (!job || job.providerJobId !== providerJobId) throw new Error("Completion does not match accepted provider job");
      if (job.receipt) {
        if (job.receipt.blobId !== blobId) throw new Error("Conflicting completion blob ID");
        return job.receipt;
      }
      const receipt: DurableStorageReceipt = {
        schema: "veyra.storage_receipt.v1", receiptId: randomUUID(), jobId: providerJobId,
        blobId, address: job.address, counterpartyId: job.counterpartyId,
        recordHash: job.recordHash, storedAt: new Date(now).toISOString(),
        status: "completed", paymentAuthorized: false,
      };
      this.db.prepare("UPDATE publication_jobs SET phase='stored',receipt=?,updated_at=? WHERE nonce=?")
        .run(JSON.stringify(receipt), now, nonce);
      return receipt;
    });
  }
  getReceiptsForWallet(address: string): DurableStorageReceipt[] {
    return this.db.prepare("SELECT receipt FROM publication_jobs WHERE address=? AND phase='stored' ORDER BY updated_at DESC LIMIT 100")
      .all(address).map(row => JSON.parse(String(row.receipt)));
  }
  close(): void { this.db.close(); }
}
