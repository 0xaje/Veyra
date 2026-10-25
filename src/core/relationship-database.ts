import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, types } from 'pg';

type Row = Record<string, any>;
export interface RelationshipDatabase {
  readonly kind: "sqlite" | "postgres";
  prepare(sql: string): { get(...args: any[]): Promise<Row | undefined>; all(...args: any[]): Promise<Row[]>; run(...args: any[]): Promise<{changes:number}> };
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Fixed internal statements only; values always travel as bound parameters. */
export function postgresStatement(sql: string): string {
  let index = 0;
  let query = sql.replace(/\?/g, () => '$' + ++index).replace(/\browid\b/g, 'sort_seq')
    .replace(/\brel_([a-z_]+)\b/g, 'veyra_private.rel_$1')
    .replace(/\b(preparations|publication_jobs|publication_meta|publication_verifications|publication_wallet)\b/g, 'veyra_publication.$1')
    .replace(/CREATE INDEX IF NOT EXISTS (?:veyra_private|veyra_publication)\.(\w+)/g, 'CREATE INDEX IF NOT EXISTS $1');
  if (/INSERT OR IGNORE/i.test(query)) query = query.replace(/INSERT OR IGNORE/i, 'INSERT') + ' ON CONFLICT DO NOTHING';
  if (/INSERT OR REPLACE INTO veyra_private.rel_limits/i.test(query))
    query = query.replace(/INSERT OR REPLACE/i, 'INSERT') + ' ON CONFLICT(k) DO UPDATE SET start=excluded.start,n=excluded.n';
  return query;
}

export function postgresOptions(value: string, allowLocal = false) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid private PostgreSQL configuration'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1))
    throw new Error('Invalid private PostgreSQL configuration');
  const local = allowLocal && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  // Never let URI parameters override certificate verification or inject session options.
  const mode = url.searchParams.get('sslmode');
  if (!local && mode && !['require', 'verify-ca', 'verify-full'].includes(mode))
    throw new Error('Private PostgreSQL requires verified TLS');
  for (const key of [...url.searchParams.keys()])
    if (!['sslmode', 'channel_binding'].includes(key)) throw new Error('Unsupported private PostgreSQL connection option');
  url.search = '';
  return { connectionString: url.toString(), ssl: local ? false as const : { rejectUnauthorized: true },
    enableChannelBinding: true, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 15_000,
    query_timeout: 20_000, application_name: 'veyra-private-relationships',
    types: { getTypeParser(oid: number, format?: string) {
      if (oid === 20 && format !== 'binary') return (value: string) => {
        const number = Number(value); if (!Number.isSafeInteger(number)) throw new Error('Unsafe database integer'); return number;
      };
      return types.getTypeParser(oid, format as 'text');
    } },
  };
}

export class PostgresRelationshipDatabase implements RelationshipDatabase {
  readonly kind = "postgres" as const;
  private pool: Pool;
  private context = new AsyncLocalStorage<PoolClient>();
  constructor(connectionString: string, allowLocal = false) {
    this.pool = new Pool(postgresOptions(connectionString, allowLocal));
    // Idle disconnects must not crash the process or print connection details.
    this.pool.on('error', () => {});
  }
  async initialize() { await this.transaction(async () => { await this.query('CREATE SCHEMA IF NOT EXISTS veyra_private'); }); }
  private async query(sql: string, values: any[] = []) {
    return (this.context.getStore() || this.pool).query(postgresStatement(sql), values);
  }
  prepare(sql: string) {
    return { get: async (...args: any[]) => (await this.query(sql, args)).rows[0],
      all: async (...args: any[]) => (await this.query(sql, args)).rows,
      run: async (...args: any[]) => ({changes:(await this.query(sql,args)).rowCount||0}) };
  }
  async exec(sql: string) {
    const ddl = sql.replace(/\) STRICT/g, ')').replace(/\bINTEGER\b/g, 'BIGINT')
      .replace('accepted BIGINT,method TEXT)', 'accepted BIGINT,method TEXT,sort_seq BIGSERIAL UNIQUE)')
      .replace('event TEXT NOT NULL,claim_id TEXT,created BIGINT NOT NULL)', 'event TEXT NOT NULL,claim_id TEXT,created BIGINT NOT NULL,sort_seq BIGSERIAL UNIQUE)');
    await this.query(ddl);
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return fn();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='10s'; SET LOCAL idle_in_transaction_session_timeout='20s'");
      // Transaction-scoped locking works through Neon transaction pooling too.
      // Serialize this small private store, preserving the SQLite state machine's atomicity.
      await client.query('SELECT pg_advisory_xact_lock(1447385426, 1)');
      const value = await this.context.run(client, fn);
      await client.query('COMMIT'); return value;
    } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
    finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}

export class SqliteRelationshipDatabase implements RelationshipDatabase {
  readonly kind = "sqlite" as const;
  private db: DatabaseSync;
  private context = new AsyncLocalStorage<boolean>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(path: string) {
    if (!path || path === ':memory:') throw new Error('Private persistent relationship database required');
    const target = resolve(path); mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    if (existsSync(target) && (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink())) throw new Error('Regular database file required');
    this.db = new DatabaseSync(target); chmodSync(target, 0o600);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
    if (this.db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw new Error('Relationship database integrity failure');
  }
  prepare(sql: string) {
    return { get: async (...args: any[]) => this.db.prepare(sql).get(...args),
      all: async (...args: any[]) => this.db.prepare(sql).all(...args),
      run: async (...args: any[]) => ({changes:Number(this.db.prepare(sql).run(...args).changes)}) };
  }
  async exec(sql: string) { this.db.exec(sql); }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return fn();
    const operation = this.queue.then(async () => {
      this.db.exec('BEGIN IMMEDIATE');
      try { const value = await this.context.run(true, fn); this.db.exec('COMMIT'); return value; }
      catch (error) { this.db.exec('ROLLBACK'); throw error; }
    });
    this.queue = operation.catch(() => {}); return operation;
  }
  async close() { await this.queue; this.db.close(); }
}
