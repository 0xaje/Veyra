import { SqliteRelationshipDatabase, PostgresRelationshipDatabase, type RelationshipDatabase } from './relationship-database.ts';
import { createHash, randomUUID } from "node:crypto";
import { PreparedPublications, type PublicationBinding } from "./prepared-publication.ts";
import { buildPublicationConsentMessage, type PublicationConsentInput } from "./self-service-confirmation.ts";
import type { ExactRecordResult } from "./exact-walrus-record.ts";
import type { DurableStorageReceipt } from "./storage-safeguards.ts";
type Prepared = ReturnType<PreparedPublications["issue"]>;
export type PublicationJob = {
    nonce: string;
    address: string;
    counterpartyId: string;
    recordHash: string;
    idempotencyKey: string;
    phase: "reserved" | "submitting" | "pending" | "uncertain" | "stored";
    providerJobId: string | null;
    receipt: DurableStorageReceipt | null;
    reservedAt: number;
    updatedAt: number;
};
export type PublicationLedgerConfig = {
    maxDailyWritesPerWallet: number;
    maxGlobalDailyWrites: number;
};
/** Shared durable publication staging, reservations and receipts. Hosted SQLite paths are not a shared budget. */
export class PublicationLedger {
    private db: RelationshipDatabase;
    private ownsDatabase = false;
    private config: PublicationLedgerConfig;
    private constructor(db: RelationshipDatabase, config: PublicationLedgerConfig, ownsDatabase = false) {
        for (const value of [config.maxDailyWritesPerWallet, config.maxGlobalDailyWrites])
            if (!Number.isSafeInteger(value) || value < 0 || value > 10000)
                throw new Error('Invalid publication write ceiling');
        this.db = db;
        this.config = {maxDailyWritesPerWallet:config.maxDailyWritesPerWallet,maxGlobalDailyWrites:config.maxGlobalDailyWrites};
        this.ownsDatabase = ownsDatabase;
    }
    static async open(path: string, config: PublicationLedgerConfig) {
        for(const value of [config.maxDailyWritesPerWallet,config.maxGlobalDailyWrites])
          if(!Number.isSafeInteger(value)||value<0||value>10_000)throw new Error('Invalid publication write ceiling');
        if(!path || path === ':memory:')throw new Error('A durable publication database path is required');
        const db = new SqliteRelationshipDatabase(path);
        try {
            const ledger = new PublicationLedger(db, config, true);
            await ledger.initialize();
            return ledger;
        }
        catch (error) {
            await db.close();
            throw error;
        }
    }
    static async connect(url:string,config:PublicationLedgerConfig,allowLocal=false) {
      const db=new PostgresRelationshipDatabase(url,allowLocal);
      try {await db.initialize();const ledger=new PublicationLedger(db,config,true);await ledger.initialize();return ledger;}
      catch(error){await db.close();throw error;}
    }
    static async attach(db: RelationshipDatabase, config: PublicationLedgerConfig) {
        const ledger = new PublicationLedger(db, config);
        await ledger.initialize();
        return ledger;
    }
    private async initialize() {
        await this.db.transaction(async () => {
            if (this.db.kind === 'postgres')
                await this.db.exec('CREATE SCHEMA IF NOT EXISTS veyra_publication');
            else {
                const version = Number((await this.db.prepare('PRAGMA user_version').get())?.user_version);
                if (version !== 0 && version !== 1)
                    throw new Error('Unsupported publication database version');
            }
            await this.db.exec(`
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
      CREATE TABLE IF NOT EXISTS publication_meta(k TEXT PRIMARY KEY,v TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS publication_verifications(nonce TEXT PRIMARY KEY REFERENCES publication_jobs(nonce),result TEXT NOT NULL) STRICT;
    `);
            await this.db.prepare("INSERT OR IGNORE INTO publication_meta VALUES('schema','1')").run();
            if ((await this.db.prepare("SELECT v FROM publication_meta WHERE k='schema'").get())?.v !== '1')
                throw new Error('Unsupported publication schema');
            const limits = JSON.stringify(this.config);
            await this.db.prepare("INSERT OR IGNORE INTO publication_meta VALUES('limits',?)").run(limits);
            if ((await this.db.prepare("SELECT v FROM publication_meta WHERE k='limits'").get())?.v !== limits)
                throw new Error('Publication budgets differ from the persisted policy; reconcile before restarting');
        });
    }
    private transaction<T>(fn: () => Promise<T>): Promise<T> { return this.db.transaction(fn); }
    private parsePrepared(payload: string): Prepared {
        const prepared = JSON.parse(payload) as Prepared;
        if (prepared.consentMessage !== buildPublicationConsentMessage(prepared.consentPayload) ||
            createHash("sha256").update(prepared.candidateJson).digest("hex") !== prepared.recordHash ||
            prepared.recordHash !== prepared.consentPayload.recordHash ||
            JSON.stringify(prepared.candidate) !== prepared.candidateJson ||
            prepared.candidate.address !== prepared.consentPayload.address ||
            prepared.candidate.counterpartyId !== prepared.consentPayload.counterpartyId)
            throw new Error("Persisted publication binding is corrupt");
        if(prepared.binding && (prepared.binding.origin !== prepared.consentPayload.origin || !/^[a-f0-9]{64}$/.test(prepared.binding.sessionHash)))
          throw new Error('Persisted publication session binding is corrupt');
        return prepared;
    }
    async issue(address: string, counterpartyId: string, now = Date.now(), binding?: PublicationBinding) {
        return await this.transaction(async () => {
            await this.db.prepare("DELETE FROM preparations WHERE consumed=0 AND expires_at<=?").run(now);
            const count = await this.db.prepare("SELECT count(*) AS n FROM preparations WHERE consumed=0").get() as {
                n: number;
            };
            if (count.n >= 200)
                throw new Error("Too many outstanding publication preparations");
            const prepared = new PreparedPublications().issue(address, counterpartyId, now, binding);
            await this.db.prepare("INSERT INTO preparations(nonce,payload,expires_at) VALUES(?,?,?)")
                .run(prepared.consentPayload.nonce, JSON.stringify(prepared), Date.parse(prepared.consentPayload.expiresAt));
            return prepared;
        });
    }
    async get(consent: PublicationConsentInput, now = Date.now(), binding?: PublicationBinding) {
        if (!consent || typeof consent.nonce !== "string")
            return null;
        const row = await this.db.prepare("SELECT payload,expires_at FROM preparations WHERE nonce=?").get(consent.nonce) as {
            payload: string;
            expires_at: number;
        } | undefined;
        if (!row || row.expires_at <= now)
            return null;
        const prepared = this.parsePrepared(row.payload);
        if(prepared.binding && (!binding || prepared.binding.origin !== binding.origin || prepared.binding.sessionHash !== binding.sessionHash)) return null;
        try {
            if (buildPublicationConsentMessage(consent) !== prepared.consentMessage)
                return null;
        }
        catch {
            return null;
        }
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
    async getJob(nonce: string) {
        const row = await this.db.prepare("SELECT * FROM publication_jobs WHERE nonce=?").get(nonce);
        return row ? this.parseJob(row) : null;
    }
    async reserve(consent: PublicationConsentInput, now = Date.now(), binding?: PublicationBinding) {
        return await this.transaction(async () => {
            const prepared = await this.get(consent, now, binding);
            if (!prepared)
                throw new Error("Publication preparation expired or changed");
            const existing = await this.getJob(consent.nonce);
            if (existing)
                return { created: false, job: existing };
            const row = await this.db.prepare("SELECT consumed FROM preparations WHERE nonce=?").get(consent.nonce) as {
                consumed: number;
            };
            if (row.consumed)
                throw new Error("Publication consent already consumed");
            const dayStart = Date.parse(new Date(now).toISOString().slice(0, 10) + "T00:00:00.000Z");
            // An unresolved older job still reserves capacity after day rollover.
            const where = "(reserved_at>=? OR phase!='stored')";
            const global = await this.db.prepare("SELECT count(*) AS n FROM publication_jobs WHERE " + where).get(dayStart) as {
                n: number;
            };
            const wallet = await this.db.prepare("SELECT count(*) AS n FROM publication_jobs WHERE address=? AND " + where)
                .get(prepared.candidate.address, dayStart) as {
                n: number;
            };
            if (global.n >= this.config.maxGlobalDailyWrites)
                throw new Error("Global publication write ceiling reached");
            if (wallet.n >= this.config.maxDailyWritesPerWallet)
                throw new Error("Wallet publication write ceiling reached");
            const idempotencyKey = "veyra-publication-" + consent.nonce;
            await this.db.prepare(`INSERT INTO publication_jobs
        (nonce,address,counterparty_id,record_hash,idempotency_key,phase,reserved_at,updated_at)
        VALUES(?,?,?,?,?,'reserved',?,?)`).run(consent.nonce, prepared.candidate.address, prepared.candidate.counterpartyId, prepared.recordHash, idempotencyKey, now, now);
            await this.db.prepare("UPDATE preparations SET consumed=1 WHERE nonce=?").run(consent.nonce);
            return { created: true, job: (await this.getJob(consent.nonce))! };
        });
    }
    async markSubmitting(nonce: string, now = Date.now()) {
        return Number((await this.db.prepare("UPDATE publication_jobs SET phase='submitting',updated_at=? WHERE nonce=? AND phase='reserved'")
            .run(now, nonce)).changes) === 1;
    }
    async markAccepted(nonce: string, providerJobId: string, now = Date.now()) {
        if (typeof providerJobId !== "string" || !providerJobId.trim() || providerJobId.length > 256)
            throw new Error("Valid provider job ID required");
        const result = await this.db.prepare(`UPDATE publication_jobs SET phase='pending',provider_job_id=?,updated_at=?
      WHERE nonce=? AND phase IN ('submitting','pending','uncertain')
      AND (provider_job_id IS NULL OR provider_job_id=?)`).run(providerJobId, now, nonce, providerJobId);
        if (Number(result.changes) !== 1)
            throw new Error("Publication job acceptance conflict");
    }
    async markUncertain(nonce: string, now = Date.now()) {
        await this.db.prepare("UPDATE publication_jobs SET phase='uncertain',updated_at=? WHERE nonce=? AND phase!='stored'").run(now, nonce);
    }
    async complete(nonce: string, providerJobId: string, blobId: string, now = Date.now()) {
        if (typeof blobId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(blobId))
            throw new Error("Durable blob ID required");
        return await this.transaction(async () => {
            const job = await this.getJob(nonce);
            if (!job || job.providerJobId !== providerJobId)
                throw new Error("Completion does not match accepted provider job");
            if (job.receipt) {
                if (job.receipt.blobId !== blobId)
                    throw new Error("Conflicting completion blob ID");
                return job.receipt;
            }
            const receipt: DurableStorageReceipt = {
                schema: "veyra.storage_receipt.v1", receiptId: randomUUID(), jobId: providerJobId,
                blobId, address: job.address, counterpartyId: job.counterpartyId,
                recordHash: job.recordHash, storedAt: new Date(now).toISOString(),
                status: "completed", paymentAuthorized: false,
            };
            await this.db.prepare("UPDATE publication_jobs SET phase='stored',receipt=?,updated_at=? WHERE nonce=?")
                .run(JSON.stringify(receipt), now, nonce);
            return receipt;
        });
    }
    async getReceiptsForWallet(address: string) {
        return await (await this.db.prepare("SELECT receipt FROM publication_jobs WHERE address=? AND phase='stored' ORDER BY updated_at DESC LIMIT 100")
            .all(address)).map(row => JSON.parse(String(row.receipt)));
    }
    async recordVerification(nonce: string, verification: ExactRecordResult) {
      return this.transaction(async () => {
        const job=await this.getJob(nonce);
        if(!job?.receipt || job.receipt.blobId!==verification.blobId || verification.identityVerified!==false || verification.paymentAuthorized!==false || verification.memoryWritten!==false ||
          !['verified','read_unanchored','mismatch','unavailable','configuration_required','unsupported_ciphertext'].includes(verification.status) ||
          !Number.isFinite(Date.parse(verification.retrievedAt)) || Date.parse(verification.retrievedAt)>Date.now()+1000 ||
          (verification.status==='verified' && (!verification.payloadHashVerified || verification.recordHash!==job.recordHash)) ||
          (verification.status!=='verified' && verification.payloadHashVerified))throw new Error('Verification does not bind to a completed publication');
        await this.db.prepare(`INSERT INTO publication_verifications(nonce,result) VALUES(?,?)
          ON CONFLICT(nonce) DO UPDATE SET result=excluded.result`).run(nonce,JSON.stringify(verification));
      });
    }
    async getVerification(nonce: string):Promise<ExactRecordResult|null> {
      const row=await this.db.prepare('SELECT result FROM publication_verifications WHERE nonce=?').get(nonce);
      return row?JSON.parse(String(row.result)):null;
    }
    async recordsForCounterparty(counterpartyId: string) {
      return this.transaction(async () => {
        const rows=await this.db.prepare(`SELECT j.nonce,j.receipt,p.payload,v.result FROM publication_jobs j
          JOIN preparations p ON p.nonce=j.nonce LEFT JOIN publication_verifications v ON v.nonce=j.nonce
          WHERE j.counterparty_id=? AND j.phase='stored' ORDER BY j.updated_at DESC LIMIT 100`).all(counterpartyId);
        return rows.map(row=>({nonce:row.nonce,receipt:JSON.parse(String(row.receipt)) as DurableStorageReceipt,
          prepared:this.parsePrepared(String(row.payload)),verification:row.result?JSON.parse(String(row.result)) as ExactRecordResult:null}));
      });
    }
    async deleteUnsubmittedForRelationship(relationshipId: string) {
      return this.transaction(async () => {
        const rows=await this.db.prepare('SELECT nonce,payload FROM preparations WHERE consumed=0').all();
        for(const row of rows)if(this.parsePrepared(String(row.payload)).candidate.counterpartyId===relationshipId)
          await this.db.prepare('DELETE FROM preparations WHERE nonce=? AND consumed=0').run(row.nonce);
      });
    }
    async close() { if (this.ownsDatabase)
        await this.db.close(); }
}
