import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresOptions, postgresStatement } from '../src/core/relationship-database.ts';

test('M3: hosted PostgreSQL always verifies TLS and never accepts URI downgrade options',()=>{
 const options=postgresOptions('postgresql://test:fixture@database.example/veyra?sslmode=require&channel_binding=require');
 assert.deepEqual(options.ssl,{rejectUnauthorized:true});assert.equal(options.enableChannelBinding,true);
 assert.equal(options.max,3);assert.ok(!options.connectionString.includes('sslmode'));
 assert.throws(()=>postgresOptions('postgresql://test:fixture@database.example/veyra?sslmode=disable'));
 assert.throws(()=>postgresOptions('postgresql://test:fixture@database.example/veyra?sslrootcert=untrusted'));
 assert.throws(()=>postgresOptions('postgresql://test:fixture@database.example/veyra?options=anything'));
 assert.deepEqual(postgresOptions('postgresql://test:fixture@127.0.0.1/veyra').ssl,{rejectUnauthorized:true});
 assert.equal(postgresOptions('postgresql://test:fixture@127.0.0.1/veyra',true).ssl,false);
 assert.deepEqual(postgresOptions('postgresql://test:fixture@database.example/veyra',true).ssl,{rejectUnauthorized:true});
});
test('M3: private SQL binds parameters and keeps PostgreSQL tables in a dedicated schema',()=>{
 assert.equal(postgresStatement('SELECT * FROM rel_contacts WHERE payer=? AND origin=?'),'SELECT * FROM veyra_private.rel_contacts WHERE payer=$1 AND origin=$2');
 assert.equal(postgresStatement('INSERT OR IGNORE INTO rel_settings VALUES(?,?)'),'INSERT INTO veyra_private.rel_settings VALUES($1,$2) ON CONFLICT DO NOTHING');
 assert.match(postgresStatement('INSERT OR REPLACE INTO rel_limits VALUES(?,?,1)'),/ON CONFLICT\(k\) DO UPDATE/);
 assert.equal(postgresStatement('CREATE INDEX IF NOT EXISTS rel_contacts_payer ON rel_contacts(payer)'), 'CREATE INDEX IF NOT EXISTS rel_contacts_payer ON veyra_private.rel_contacts(payer)');
});
