import { MemWal } from "@mysten-incubation/memwal";
import { randomUUID } from "node:crypto";
const key = process.env.MEMWAL_PRIVATE_KEY;
const accountId = process.env.MEMWAL_ACCOUNT_ID;
if (!key || !accountId) { console.error("Missing MEMWAL_PRIVATE_KEY or MEMWAL_ACCOUNT_ID. Obtain them from https://memory.walrus.xyz and keep them private."); process.exit(2); }
const namespace = process.env.MEMWAL_NAMESPACE || "veyra-dev";
const memwal = MemWal.create({ key, accountId, serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz", namespace });
const proofId = randomUUID();
const statement = `Veyra integration verification ${proofId}. This is a genuine SDK memory-write test, not an observed transfer or a risk finding.`;
await memwal.health();
const job = await memwal.remember(statement);
const stored = await memwal.waitForRememberJob(job.job_id);
if (!stored?.blob_id) throw new Error("Memory write did not return a Walrus blob ID");
const result = await memwal.recall({ query: statement, limit: 20 });
const match = result.results.find(item => item.blob_id === stored.blob_id && item.text === statement);
if (!match) throw new Error("Memory write succeeded but exact content was not retrieved");
console.log(JSON.stringify({ status: "verified", network: "mainnet", namespace, blobId: stored.blob_id, jobId: job.job_id, proofId, checkedAt: new Date().toISOString() }, null, 2));
