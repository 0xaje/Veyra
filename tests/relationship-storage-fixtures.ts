import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

/** Real, disposable localhost PostgreSQL databases. Never accepts a hosted/production URI. */
export async function postgresFixture() {
  const source = new URL(process.env.TEST_DATABASE_URL || '');
  if (!['127.0.0.1', 'localhost'].includes(source.hostname)) throw new Error('Integration fixtures require localhost PostgreSQL');
  const admin = new Pool({ connectionString: source.toString(), max: 1 });
  const name = 'veyra_test_' + randomUUID().replaceAll('-', '');
  try { await admin.query('CREATE DATABASE "' + name + '"'); } finally { await admin.end(); }
  const target = new URL(source); target.pathname = '/' + name;
  return { url: target.toString(), async dispose() {
    const cleanup = new Pool({ connectionString: source.toString(), max: 1 });
    try { await cleanup.query('DROP DATABASE "' + name + '" WITH (FORCE)'); } finally { await cleanup.end(); }
  } };
}
