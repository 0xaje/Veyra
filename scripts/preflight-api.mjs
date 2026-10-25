import { createSavedAssessmentsApi } from './saved-assessments-api.mjs';
// Veyra preflight HTTP API: local write-capable mode, public read-only mode. Never signs or submits payments.
import { createServer } from "node:http";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web");
import { spawn } from "node:child_process";
import { normalizeSuiAddress } from "../src/core/recipient-check.ts";
import { preflightWithEvidence } from "../src/core/evidence-preflight.ts";
import { createPreflightLimiter } from "./preflight-limiter.mjs";
import { createPrivateRelationshipsApi } from "./private-relationships-api.mjs";
import { ExactWalrusReader, EXISTING_PUBLIC_BLOB } from "../src/core/exact-walrus-record.ts";
import { PublicationLedger } from "../src/core/publication-ledger.ts";
import { existsSync } from "node:fs";
import { collectMemoryInventory } from "../src/core/memory-inventory.ts";
import {
  verifyPublicationConsent,
} from "../src/core/self-service-confirmation.ts";

import { acceptedMemoryJob, completedMemoryJob } from "../src/core/memory-write-state.ts";

const port = Number(process.env.PORT || process.env.VEYRA_PORT || 8787);
const publicMode = process.env.VEYRA_PUBLIC_MODE === "true";
// Explicit opt-in: public verification is independent of public memory writes.
const publicWalletProof = publicMode && process.env.VEYRA_PUBLIC_WALLET_PROOF === "true";
const walletOrigin = process.env.VEYRA_PUBLIC_ORIGIN || "";
if (publicWalletProof && (!/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(walletOrigin) || walletOrigin.includes("..")))
  throw new Error("VEYRA_PUBLIC_ORIGIN must be an explicit HTTPS origin when enabling public wallet proof");
const walletRequests = new Map();
function walletRequestAllowed(ip, now = Date.now()) {
  for (const [key, state] of walletRequests) if (now - state.start >= 60000) walletRequests.delete(key);
  const key = String(ip || "unknown").slice(0, 128);
  const state = walletRequests.get(key);
  if (state) { if (state.count >= 12) return false; state.count++; return true; }
  if (walletRequests.size >= 5000) return false;
  walletRequests.set(key, { start: now, count: 1 }); return true;
}
const host = process.env.VEYRA_HOST || (publicMode ? "0.0.0.0" : "127.0.0.1");
if (!["127.0.0.1", "0.0.0.0"].includes(host)) throw new Error("Invalid VEYRA_HOST");
if (host === "0.0.0.0" && !publicMode) throw new Error("Public binding requires VEYRA_PUBLIC_MODE=true");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid VEYRA_PORT");
const maxBody = 8192;
const limiter = createPreflightLimiter({
  perClient: Number(process.env.VEYRA_PREFLIGHT_PER_MINUTE ?? 8),
  maxConcurrent: Number(process.env.VEYRA_PREFLIGHT_CONCURRENCY ?? 2),
});
const privateRequestCounts = new Map();
function privateRequestAllowed(ip,now=Date.now()) {
  for(const [key,value] of privateRequestCounts)if(now-value.start>=60000)privateRequestCounts.delete(key);
  const key=String(ip||"unknown").slice(0,128),value=privateRequestCounts.get(key);
  if(value){if(value.count>=60)return false;value.count++;return true;}
  if(privateRequestCounts.size>=5000)return false;
  privateRequestCounts.set(key,{start:now,count:1});return true;
}
const exactReader = new ExactWalrusReader({delegateKey:process.env.MEMWAL_PRIVATE_KEY||"",accountId:process.env.MEMWAL_ACCOUNT_ID||"",sealApiKey:process.env.MEMWAL_SEAL_API_KEY||""});
let exactReadiness = {status:"not_checked",payloadHashVerified:false,paymentAuthorized:false,memoryWritten:false};
async function checkExactReadiness() { exactReadiness=await exactReader.read(EXISTING_PUBLIC_BLOB);return exactReadiness; }
const privateRelationships = await createPrivateRelationshipsApi({publicMode,port,requestAllowed:privateRequestAllowed,readPublicationReadiness:checkExactReadiness,readPublicationReceipt:(receipt)=>exactReader.read(receipt.blobId,receipt)});
const savedAssessments = await createSavedAssessmentsApi({db:privateRelationships.memoryStorage,origin:publicMode?walletOrigin:`http://127.0.0.1:${port}`,publicMode,requestAllowed:privateRequestAllowed});
const publicationDbPath = process.env.VEYRA_PUBLICATION_DB || "";
if (!publicMode && publicationDbPath &&
    existsSync(resolve(process.env.VEYRA_SAFEGUARDS_FILE || "data/safeguards-ledger.json")))
  throw new Error("Reconcile the existing legacy safeguards ledger before configuring a new publication database");
const publicationLedger = !publicMode && publicationDbPath ? await PublicationLedger.open(publicationDbPath, {
  maxDailyWritesPerWallet: Number(process.env.VEYRA_MAX_DAILY_CONFIRMATIONS_PER_WALLET ?? 3),
  maxGlobalDailyWrites: Number(process.env.VEYRA_MAX_GLOBAL_DAILY_WRITES ?? 50),
}) : privateRelationships.publicationLedger;
const publicationPolls = new Map();
async function pollPublication(nonce) {
  if (!publicationLedger) return null;
  const job = await publicationLedger.getJob(nonce);
  if (!job || !job.providerJobId) return job;
  if(job.phase === 'stored'){
    if(job.receipt)await publicationLedger.recordVerification(nonce,await exactReader.read(job.receipt.blobId,job.receipt));
    return job;
  }
  if (publicationPolls.has(nonce)) return publicationPolls.get(nonce);
  const task = (async () => {
    try {
      const { MemWal } = await import("@mysten-incubation/memwal");
      const memory = MemWal.create({
        key: process.env.MEMWAL_PRIVATE_KEY, accountId: process.env.MEMWAL_ACCOUNT_ID,
        serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
        namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
      });
      const completed = completedMemoryJob({ status: "pending", jobId: job.providerJobId },
        await memory.waitForRememberJob(job.providerJobId, { timeoutMs: 1500, pollIntervalMs: 300 }));
      if (completed.status !== "stored") throw new Error("No durable completion blob");
      const receipt=await publicationLedger.complete(nonce, job.providerJobId, completed.blobId);
      await publicationLedger.recordVerification(nonce,await exactReader.read(receipt.blobId,receipt));
    } catch {
      // Unknown is not failure. Retain accepted job and reserved capacity.
      await publicationLedger.markUncertain(nonce);
    }
    return await publicationLedger.getJob(nonce);
  })();
  publicationPolls.set(nonce, task);
  try { return await task; } finally { publicationPolls.delete(nonce); }
}
const historyPath = !publicMode && process.env.VEYRA_HISTORY_FILE ? resolve(process.env.VEYRA_HISTORY_FILE) : null;
let historyWrite = Promise.resolve();
function persistAssessment(entry) {
  if (!historyPath) return Promise.resolve(false);
  const line = JSON.stringify(entry) + "\n";
  const pending = historyWrite.then(async () => {
    await mkdir(dirname(historyPath), { recursive: true, mode: 0o700 });
    await appendFile(historyPath, line, { encoding: "utf8", mode: 0o600, flag: "a" });
    return true;
  });
  historyWrite = pending.then(() => undefined, () => undefined);
  return pending;
}
async function loadHistory() {
  if (!historyPath) return { enabled: false, records: [] };
  await historyWrite;
  let raw;
  try { raw = await readFile(historyPath, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return { enabled: true, records: [] }; throw error; }
  const records = [];
  for (const line of raw.split("\n").filter(Boolean).slice(-100)) {
    try { const entry = JSON.parse(line); if (entry?.schema === "veyra.assessment.v1") records.push(entry); }
    catch { /* Ignore incomplete journal lines. */ }
  }
  return { enabled: true, records: records.reverse().slice(0, 50) };
}
const digestPattern = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

async function tatum(digest) {
  if (!digest) return { observation: null, status: "not_requested" };
  if (!process.env.TATUM_API_KEY || !process.env.SUI_PROTO_DIR)
    return { observation: null, status: "unavailable", reason: "Tatum credentials or proto directory missing" };
  return new Promise(resolve => {
    const child = spawn(process.execPath, ["scripts/tatum-sui-grpc.mjs", digest], {
      cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 25000);
    child.stdout.on("data", chunk => { stdout += chunk.toString().slice(0, 65536 - stdout.length); });
    child.stderr.on("data", chunk => { stderr += chunk.toString().slice(0, 2048 - stderr.length); });
    child.on("error", () => { clearTimeout(timer); resolve({ observation: null, status: "unavailable" }); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) return resolve({ observation: null, status: "unavailable" });
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.status !== "observed" || parsed.requestedDigest !== digest ||
            parsed.evidence?.digest !== digest || parsed.method !== "LedgerService/GetTransaction")
          throw new Error("Unexpected Tatum response");
        resolve({ observation: parsed, status: "observed" });
      } catch {
        resolve({ observation: null, status: "unavailable" });
      }
    });
  });
}

async function recall(counterpartyId) {
  if (!process.env.MEMWAL_PRIVATE_KEY || !process.env.MEMWAL_ACCOUNT_ID)
    return { records: [], status: "unavailable" };
  try {
    const { MemWal } = await import("@mysten-incubation/memwal");
    const memory = MemWal.create({
      key: process.env.MEMWAL_PRIVATE_KEY,
      accountId: process.env.MEMWAL_ACCOUNT_ID,
      serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
      namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
    });
    const response = await Promise.race([
      memory.recall({ query: `veyra recipient record sui mainnet counterparty ${counterpartyId}`, limit: 20 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
    ]);
    const records = [];
    for (const item of response.results ?? []) {
      if (typeof item.text !== "string" || typeof item.blob_id !== "string") continue;
      try {
        const record = JSON.parse(item.text);
        if (record?.type !== "veyra.recipient.v1" ||
            record.counterpartyId !== counterpartyId || record.chain !== "sui" ||
            record.network !== "mainnet" || typeof record.address !== "string" ||
            typeof record.confirmation?.method !== "string" ||
            typeof record.confirmation?.reference !== "string" ||
            typeof record.confirmation?.confirmedAt !== "string") continue;
        records.push({ blobId: item.blob_id, record });
      } catch { /* Ignore unparseable, untrusted recall items. */ }
    }
    return { records, status: "observed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Walrus error";
    // Log a bounded error category, never SDK request objects or credentials.
    const category = /timeout/i.test(message) ? "timeout" : /401|403|unauthoriz|forbidden/i.test(message) ? "authentication" : /429|rate.limit/i.test(message) ? "rate_limited" : "service_error";
    console.error(`[veyra] Walrus recipient recall failed: ${category}`);
    return { records: [], status: "unavailable", diagnostic: category };
  }
}

// Additional read-only MemWal search for recipient evidence. Semantic results are
// non-exhaustive; these observations cannot establish complete history or safety.
async function recallRecipientEvidence(counterpartyId, proposedAddress) {
  const unavailable = { events: [], walletControlEvents: [], status: "unavailable", walletControlStatus: "unavailable" };
  if (!process.env.MEMWAL_PRIVATE_KEY || !process.env.MEMWAL_ACCOUNT_ID) return unavailable;
  try {
    const { MemWal } = await import("@mysten-incubation/memwal");
    const memory = MemWal.create({
      key: process.env.MEMWAL_PRIVATE_KEY,
      accountId: process.env.MEMWAL_ACCOUNT_ID,
      serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
      namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
    });
    const search = async (query, type) => {
      let timer;
      try {
        const response = await Promise.race([
          memory.recall({ query, limit: 30 }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 15000); }),
        ]);
        if (!Array.isArray(response?.results)) throw new Error("Malformed recall response");
        const records = [];
        for (const item of response.results) {
          if (typeof item?.text !== "string" || typeof item?.blob_id !== "string" || !item.blob_id) continue;
          try {
            const record = JSON.parse(item.text);
            if (record?.type !== type || record.chain !== "sui" || record.network !== "mainnet") continue;
            if (type === "veyra.recipient_evidence.v1" && record.counterpartyId !== counterpartyId) continue;
            if (type === "veyra.wallet_control_memory.v1" && normalizeSuiAddress(record.address) !== proposedAddress) continue;
            records.push({ blobId: item.blob_id, record });
          } catch { /* Untrusted search result; unified interpretation validates applicable fields. */ }
        }
        return { records, status: response.dropped_count > 0 || response.meta?.truncated ? "degraded" : "observed" };
      } catch { return { records: [], status: "unavailable" }; }
      finally { clearTimeout(timer); }
    };
    const [recipient, control] = await Promise.all([
      search(`veyra recipient evidence sui mainnet counterparty ${counterpartyId}`, "veyra.recipient_evidence.v1"),
      search(`veyra wallet control memory sui mainnet address ${proposedAddress}`, "veyra.wallet_control_memory.v1"),
    ]);
    return { events: recipient.records, walletControlEvents: control.records, status: recipient.status, walletControlStatus: control.status };
  } catch { return unavailable; }
}

async function handler(req, res) {
  if(await savedAssessments.handle(req,res))return;
  if(await privateRelationships.handle(req,res))return;
  if(req.method==="GET"&&["/relationships.js","/saved-checks.js"].includes(req.url)){
    try{
      const source=await readFile(resolve(webRoot,req.url.slice(1)),"utf8");
      res.writeHead(200,{"content-type":"text/javascript; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(source);return;
    }catch{res.writeHead(503);res.end();return;}
  }
  const send = (status, data) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify(data));
  };
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html" || req.url === "/docs" || req.url === "/history" || req.url === "/memory" || req.url === "/verify-wallet" || req.url === "/contacts" || req.url === "/receive-private")) {
    try {
      const html = await readFile(resolve(webRoot, req.url === "/contacts" ? "contacts.html" : req.url === "/receive-private" ? "receive-private.html" : req.url === "/docs" ? "docs.html" : req.url === "/history" ? "history.html" : req.url === "/memory" ? "memory.html" : req.url === "/verify-wallet" ? "verify-wallet.html" : "index.html"), "utf8");
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      });
      return res.end(html);
    } catch { return send(503, { error: "Interface unavailable" }); }
  }
  if (req.method === "GET" && req.url === "/v1/history") {
    if (publicMode) return send(200, { enabled: false, records: [], privacy: "Public assessment history disabled" });
    try { return send(200, await loadHistory()); }
    catch { return send(503, { error: "Assessment journal unavailable" }); }
  }
  if (req.method === "POST" && ["/v1/wallet-challenge", "/v1/wallet-verify"].includes(req.url)) {
    if (publicMode && !publicWalletProof) return send(403, { error: "Public wallet proof not enabled", paymentAuthorized: false });
    const allowedOrigin = publicMode ? walletOrigin : `http://127.0.0.1:${port}`;
    // Browsers send Origin on JSON POST. Reject missing or foreign origins in public mode.
    if (publicMode && req.headers.origin !== allowedOrigin) return send(403, { error: "Valid same-site origin required", paymentAuthorized: false });
    if (req.headers["sec-fetch-site"] === "cross-site") return send(403, { error: "Cross-site request forbidden", paymentAuthorized: false });
    if (!walletRequestAllowed(req.socket.remoteAddress)) return send(429, { error: "Wallet verification rate limit reached", paymentAuthorized: false });
    if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json"))
      return send(415, { error: "JSON required", paymentAuthorized: false });
    if (req.headers.origin && req.headers.origin !== allowedOrigin)
      return send(403, { error: "Cross-origin request forbidden", paymentAuthorized: false });
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > maxBody) return send(413, { error: "Request too large", paymentAuthorized: false });
      }
      const input = JSON.parse(body);
      const { issueWalletChallenge, verifyWalletChallenge } = await import("../src/core/wallet-challenge.ts");
      if (req.url === "/v1/wallet-challenge") {
        if (typeof input.address !== "string") return send(400, { error: "Address required", paymentAuthorized: false });
        return send(200, { status: "challenge_issued", ...issueWalletChallenge(input.address) });
      }
      const result = await verifyWalletChallenge(input);
      if (result.status === "wallet_control_verified") {
        const { prepareWalletControlReceipt } = await import("../src/core/wallet-control-receipt.ts");
        return send(200, { ...result, proposedReceipt: prepareWalletControlReceipt(result), walrusMemoryWritten: false });
      }
      return send(400, result);
    } catch {
      return send(400, { error: "Wallet proof request failed", paymentAuthorized: false });
    }
  }
  if (req.method === "POST" && req.url === "/v1/self-service/prepare-consent") {
    if (publicMode) return send(403, { error: "Public publication remains disabled until security gates are complete", paymentAuthorized: false });
    if (req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`))
      return send(403, { error: "Cross-origin publication forbidden", paymentAuthorized: false });
    if (!walletRequestAllowed(req.socket.remoteAddress))
      return send(429, { error: "Publication request limit reached", paymentAuthorized: false });
    if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json"))
      return send(415, { error: "JSON required", paymentAuthorized: false });
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > maxBody) return send(413, { error: "Request too large", paymentAuthorized: false });
      }
      const input = JSON.parse(body);
      if (typeof input.address !== "string" || typeof input.counterpartyId !== "string" || !input.counterpartyId.trim())
        return send(400, { error: "Address and counterpartyId required", paymentAuthorized: false });

      if (!publicationLedger) return send(503, { error: "Durable publication database not configured", paymentAuthorized: false });
      const prepared = await publicationLedger.issue(input.address, input.counterpartyId);
      const { consentPayload, consentMessage } = prepared;

      return send(200, {
        status: "consent_prepared",
        consentPayload,
        consentMessage,
        candidateRecord: prepared.candidate,
        recordHash: prepared.recordHash,
        paymentAuthorized: false,
      });
    } catch (error) {
      return send(400, { error: error instanceof Error ? error.message : "Preparation failed", paymentAuthorized: false });
    }
  }
  if (req.method === "POST" && req.url === "/v1/self-service/confirm-and-store") {
    // M3 gates are not complete: environment flags cannot bypass this boundary.
    if (publicMode) {
      return send(403, { error: "Public self-service writes are not enabled on this deployment", paymentAuthorized: false });
    }
    if (req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`))
      return send(403, { error: "Cross-origin publication forbidden", paymentAuthorized: false });
    if (!walletRequestAllowed(req.socket.remoteAddress))
      return send(429, { error: "Publication request limit reached", paymentAuthorized: false });
    if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json"))
      return send(415, { error: "JSON required", paymentAuthorized: false });
    if (!process.env.MEMWAL_PRIVATE_KEY || !process.env.MEMWAL_ACCOUNT_ID)
      return send(503, { error: "Walrus storage provider credentials unavailable", paymentAuthorized: false });

    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > maxBody) return send(413, { error: "Request too large", paymentAuthorized: false });
      }
      const input = JSON.parse(body);
      const { consent, signature } = input;
      if (!consent || typeof signature !== "string" || !signature.trim()) {
        return send(400, { error: "Valid signed publication consent and signature required", paymentAuthorized: false });
      }
      if (!publicationLedger) return send(503, { error: "Durable publication database not configured", paymentAuthorized: false });
      const prepared = await publicationLedger.get(consent);
      if (!prepared) return send(409, { error: "Preparation expired, consumed or changed; prepare and review again", paymentAuthorized: false });
      // Bind retries to this server-issued preparation, never a caller-selected key.
      const idKey = "veyra-publication-" + consent.nonce;

      // 1. Verify publication consent signature
      const verification = await verifyPublicationConsent(consent, signature);
      if (verification.status !== "valid" || !verification.verifiedConsent) {
        return send(400, { error: verification.error || "Publication consent signature verification failed", paymentAuthorized: false });
      }

      // Nonce consumption and capacity reservation commit atomically.
      let reservation;
      try { reservation = await publicationLedger.reserve(consent); }
      catch { return send(429, { error: "Publication admission refused; review preparation, quota or ledger", paymentAuthorized: false }); }
      if (!reservation.created) {
        const job = reservation.job;
        return send(job.receipt ? 200 : 202, {
          status: job.receipt ? "already_stored_idempotent" : "pending",
          receipt: job.receipt, publicationNonce: job.nonce, jobId: job.providerJobId,
          phase: job.phase, paymentAuthorized: false,
        });
      }
      if (!(await publicationLedger.markSubmitting(consent.nonce)))
        return send(409, { error: "Publication already submitted", paymentAuthorized: false });
      try {
        const { MemWal } = await import("@mysten-incubation/memwal");
        const memory = MemWal.create({
          key: process.env.MEMWAL_PRIVATE_KEY, accountId: process.env.MEMWAL_ACCOUNT_ID,
          serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
          namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
        });
        const pending = acceptedMemoryJob(await memory.remember(prepared.candidateJson, { idempotencyKey: idKey }));
        if (pending.status !== "pending") throw new Error("Provider acceptance unavailable");
        await publicationLedger.markAccepted(consent.nonce, pending.jobId);
        // Accepted job is durable BEFORE returning progress; this is not stored.
        void pollPublication(consent.nonce).catch(() => {});
        return send(202, {
          status: "pending", publicationNonce: consent.nonce, jobId: pending.jobId,
          phase: "pending", paymentAuthorized: false,
          limitation: "Accepted for processing; completion is not yet established.",
        });
      } catch {
        await publicationLedger.markUncertain(consent.nonce);
        return send(202, {
          status: "pending", publicationNonce: consent.nonce, phase: "uncertain", paymentAuthorized: false,
          limitation: "Submission outcome is uncertain. Capacity remains reserved; reconcile the existing job before any new write.",
        });
      }
    } catch (error) {
      return send(500, { error: "Publication could not be completed; inspect durable local status", paymentAuthorized: false });
    }
  }
  if ((req.method === "GET" && req.url?.startsWith("/v1/self-service/jobs?")) ||
      (req.method === "POST" && req.url === "/v1/self-service/recover")) {
    if (publicMode) return send(403, { error: "Public publication status access disabled", paymentAuthorized: false });
    if (!publicationLedger) return send(503, { error: "Durable publication database not configured", paymentAuthorized: false });
    if (req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`))
      return send(403, { error: "Cross-origin publication forbidden", paymentAuthorized: false });
    if (!walletRequestAllowed(req.socket.remoteAddress))
      return send(429, { error: "Publication status request limit reached", paymentAuthorized: false });
    try {
      let nonce;
      if (req.method === "GET") nonce = new URL(req.url, "http://localhost").searchParams.get("nonce");
      else {
        if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json"))
          return send(415, { error: "JSON required", paymentAuthorized: false });
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > maxBody) return send(413, { error: "Request too large", paymentAuthorized: false });
        }
        nonce = JSON.parse(body).nonce;
      }
      if (typeof nonce !== "string" || !/^[a-f0-9]{32}$/.test(nonce))
        return send(400, { error: "Valid publication nonce required", paymentAuthorized: false });
      const job = req.method === "POST" ? await pollPublication(nonce) : await publicationLedger.getJob(nonce);
      if (!job) return send(404, { error: "Publication job not found", paymentAuthorized: false });
      return send(job.receipt ? 200 : 202, {
        status: job.receipt ? "stored" : "pending", receipt: job.receipt,
        publicationNonce: nonce, phase: job.phase, jobId: job.providerJobId, paymentAuthorized: false,
        limitation: job.providerJobId ? "Recovery polls the existing job only." :
          "Provider acceptance is unknown; automatic resubmission is forbidden. Operator reconciliation required.",
      });
    } catch { return send(503, { error: "Durable publication status unavailable", paymentAuthorized: false }); }
  }
  if (req.method === "GET" && req.url?.startsWith("/v1/self-service/receipts?")) {
    if (publicMode) return send(403, { error: "Public receipt discovery disabled", paymentAuthorized: false });
    const url = new URL(req.url, "http://localhost");
    const address = url.searchParams.get("address");
    if (!address) return send(400, { error: "Address required" });
    return send(200, {
      schema: "veyra.receipt_list.v1",
      address,
      receipts: (await publicationLedger?.getReceiptsForWallet(normalizeSuiAddress(address))) || [],
    });
  }
  if (req.method === "GET" && req.url === "/v1/walrus-inventory") {
    if (!process.env.MEMWAL_PRIVATE_KEY || !process.env.MEMWAL_ACCOUNT_ID) {
      return send(503, { error: "Walrus credentials unavailable", memories: [] });
    }
    try {
      const { MemWal } = await import("@mysten-incubation/memwal");
      const memory = MemWal.create({
        key: process.env.MEMWAL_PRIVATE_KEY,
        accountId: process.env.MEMWAL_ACCOUNT_ID,
        serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
        namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
      });
      const inventory = await collectMemoryInventory(memory, process.env.MEMWAL_NAMESPACE || "veyra-dev");
      return send(200, {
        schema: "veyra.walrus_inventory.v1",
        namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
        ...inventory,
        paymentAuthorized: false,
      });
    } catch (err) {
      return send(503, { error: "Walrus metadata inventory unavailable", memories: [], completeness: "unknown", contentVerified: false });
    }
  }
  if (req.method === "GET" && req.url === "/health")
    return send(200, { status: "running", buildCommit: process.env.RENDER_GIT_COMMIT || null, paymentAuthorized: false, publicMode, walletProofEnabled: !publicMode || publicWalletProof, memoryWritesEnabled: !publicMode || savedAssessments.enabled, selfServiceWritesEnabled: savedAssessments.enabled || (!publicMode && Boolean(publicationLedger && process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID)), recipientPublicationEnabled: !publicMode && Boolean(publicationLedger && process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID), publicationSecurityGatesComplete: false, assessmentMemorySavingEnabled:savedAssessments.enabled, privateRelationshipsEnabled: privateRelationships.enabled, privateRelationshipStorage: privateRelationships.storage, publicationPreparationEnabled: Boolean(privateRelationships.publicationLedger), publicationStateStorage: privateRelationships.publicationLedger ? privateRelationships.storage : publicationDbPath ? "sqlite" : null, exactBlobReadiness: exactReadiness });
  if (req.method === "GET" && req.url?.startsWith("/v1/evidence-timeline?")) {
    const url = new URL(req.url, "http://localhost");
    const counterpartyId = url.searchParams.get("counterpartyId");
    if (!counterpartyId || counterpartyId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(counterpartyId))
      return send(400, { error: "Valid counterpartyId required", paymentAuthorized: false });
    if (!process.env.MEMWAL_PRIVATE_KEY || !process.env.MEMWAL_ACCOUNT_ID)
      return send(503, { status: "unavailable", events: [], paymentAuthorized: false });
    try {
      const { MemWal } = await import("@mysten-incubation/memwal");
      const memory = MemWal.create({
        key: process.env.MEMWAL_PRIVATE_KEY,
        accountId: process.env.MEMWAL_ACCOUNT_ID,
        serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
        namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
      });
      const response = await Promise.race([
        memory.recall({ query: `veyra recipient evidence source observed package ${counterpartyId}`, limit: 30 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Recall timeout")), 15000)),
      ]);
      const events = [];
      const seen = new Set();
      for (const item of response.results ?? []) {
        if (typeof item?.text !== "string" || typeof item?.blob_id !== "string" || seen.has(item.blob_id)) continue;
        try {
          const event = JSON.parse(item.text);
          if (event.type !== "veyra.recipient_evidence.v1" || event.counterpartyId !== counterpartyId ||
              event.chain !== "sui" || event.network !== "mainnet" || event.paymentAuthorized !== false ||
              !["informational_unverified", "direct_owner_confirmed_with_signed_consent"].includes(event.trust) ||
              !["wallet", "package", "shared_object"].includes(event.addressKind) ||
              !["source_observed", "recipient_reconfirmed", "mismatch_reviewed"].includes(event.eventType) ||
              typeof event.address !== "string" || typeof event.source?.reference !== "string" ||
              typeof event.source?.observedAt !== "string") continue;
          normalizeSuiAddress(event.address);
          seen.add(item.blob_id);
          events.push({ blobId: item.blob_id, counterpartyId, address: event.address,
            addressKind: event.addressKind, eventType: event.eventType, source: event.source,
            trust: event.trust, paymentAuthorized: false });
        } catch { /* Ignore malformed or unrelated recall results. */ }
      }
      events.sort((a,b) => b.source.observedAt.localeCompare(a.source.observedAt));
      const proposedRaw = url.searchParams.get("proposedAddress");
      if (proposedRaw !== null) {
        let proposedAddress;
        try { proposedAddress = normalizeSuiAddress(proposedRaw); }
        catch { return send(400, { status: "invalid_address", paymentAuthorized: false }); }
        // Only user-reconfirmed wallet observations can serve as informational baselines.
        // Search recall is non-exhaustive: no match must never mean safe.
        const baselines = events.filter(e => e.addressKind === "wallet" &&
          e.eventType === "recipient_reconfirmed" && e.source?.kind === "direct_owner_confirmation");
        const addresses = [...new Set(baselines.map(e => normalizeSuiAddress(e.address)))];
        const comparison = addresses.length === 0 ? "no_recalled_baseline" :
          addresses.length > 1 ? "conflicting_recalled_baselines" :
          addresses[0] === proposedAddress ? "matches_recalled_observation" : "differs_from_recalled_observation";
        return send(200, { status: "read_only_comparison", counterpartyId, proposedAddress,
          comparison, recalledAddresses: addresses, evidenceBlobIds: baselines.map(e => e.blobId),
          action: "manual_review_required", independentlyVerified: false, paymentAuthorized: false,
          limitation: "MemWal semantic search may omit records. Match is not proof of identity, exchange deposit validity or transfer safety. Never authorize payment from this result." });
      }
      return send(200, { status: "observed", counterpartyId, events, paymentAuthorized: false,
        limitation: "Search-based recall may be incomplete; stored observations do not verify ownership or payment safety." });
    } catch {
      return send(503, { status: "unavailable", counterpartyId, events: [], paymentAuthorized: false });
    }
  }
  if (req.method === "POST" && req.url === "/v1/recipient-evidence") {
    if (publicMode) return send(403, { error: "Evidence memory writes are disabled on the public service", paymentAuthorized: false });
    if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json"))
      return send(415, { error: "JSON content type required", paymentAuthorized: false });
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${port}`)
      return send(403, { error: "Cross-origin evidence writes forbidden", paymentAuthorized: false });
    if (!process.env.MEMWAL_PRIVATE_KEY || !process.env.MEMWAL_ACCOUNT_ID)
      return send(503, { error: "Walrus credentials unavailable", paymentAuthorized: false });
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > maxBody)
          return send(413, { error: "Request too large", paymentAuthorized: false });
      }
      const input = JSON.parse(body);
      if (input?.userApprovedStorage !== true || input?.confirmWrite !== "STORE")
        return send(400, { error: "Explicit storage consent and STORE confirmation required", paymentAuthorized: false });
      const { prepareRecipientEvidenceEvent } = await import("../src/core/recipient-evidence-event.ts");
      const { writeRecipientEvidenceEvent } = await import("../src/core/recipient-evidence-writer.ts");
      const record = prepareRecipientEvidenceEvent(input);
      const { MemWal } = await import("@mysten-incubation/memwal");
      const writer = MemWal.create({
        key: process.env.MEMWAL_PRIVATE_KEY,
        accountId: process.env.MEMWAL_ACCOUNT_ID,
        serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
        namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
      });
      const health = await writer.health();
      if (health.write_ready !== true || !["ok", "healthy"].includes(health.writes))
        return send(503, { error: "Walrus writes are not ready", paymentAuthorized: false });
      const outcome = await writeRecipientEvidenceEvent(input, writer, { writesEnabled: true });
      return send(outcome.state.status === "stored" ? 200 : 503, {
        ...outcome, counterpartyId: record.counterpartyId, address: record.address,
        paymentAuthorized: false,
      });
    } catch (error) {
      return send(400, { status: "evidence_write_failed", paymentAuthorized: false,
        error: error instanceof Error ? error.message : "Evidence write failed" });
    }
  }
  if (req.method === "POST" && req.url === "/v1/recipient-memory") {
    if (publicMode) return send(403, { error: "Recipient memory writes are disabled on the public service", paymentAuthorized: false });
    if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json"))
      return send(415, { error: "JSON content type required" });
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${port}`)
      return send(403, { error: "Cross-origin memory writes forbidden" });
    if (!process.env.MEMWAL_PRIVATE_KEY || !process.env.MEMWAL_ACCOUNT_ID)
      return send(503, { error: "Walrus credentials unavailable" });
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > maxBody) return send(413, { error: "Request too large" });
      }
      const input = JSON.parse(body);
      if (input.userApprovedStorage !== true || input.confirmWrite !== "STORE")
        return send(400, { error: "Explicit storage consent and STORE confirmation required" });
      const { prepareRecipientRegistration } = await import("../src/core/recipient-registration.ts");
      const { registerRecipientWithWalrus } = await import("../src/core/recipient-memory-writer.ts");
      const registration = prepareRecipientRegistration(input);
      const { validateRecipientUpdate } = await import("../src/core/recipient-update.ts");
      await validateRecipientUpdate(input, registration.record, recall);
      const { MemWal } = await import("@mysten-incubation/memwal");
      const writer = MemWal.create({
        key: process.env.MEMWAL_PRIVATE_KEY,
        accountId: process.env.MEMWAL_ACCOUNT_ID,
        serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
        namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
      });
      const health = await writer.health();
      if (health.write_ready !== true || !["ok", "healthy"].includes(health.writes))
        return send(503, { error: "Walrus writes are not ready" });
      const outcome = await registerRecipientWithWalrus(input, writer, { writesEnabled: true });
      return send(outcome.state.status === "stored" ? 200 : 503, {
        ...outcome, counterpartyId: registration.record.counterpartyId,
        address: registration.record.address, paymentAuthorized: false,
      });
    } catch (error) {
      return send(400, { status: "registration_failed", paymentAuthorized: false,
        error: error instanceof Error ? error.message : "Registration failed" });
    }
  }
  if (req.method !== "POST" || req.url !== "/v1/preflight")
    return send(404, { error: "Not found" });
  if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json"))
    return send(415, { status: "preflight_failed", action: "manual_review_required", paymentAuthorized: false, reason: "JSON content type required" });
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > maxBody) return send(413, { error: "Request too large", paymentAuthorized: false });
    }
    let data;
    try { data = JSON.parse(body); }
    catch { return send(400, { status: "preflight_failed", action: "manual_review_required", paymentAuthorized: false, reason: "Malformed JSON request body" }); }
    if(data?.relationshipId!==undefined)data.counterpartyId=data.relationshipId;
    if (typeof data.counterpartyId !== "string" || !data.counterpartyId.trim() ||
        data.counterpartyId.length > 128 || typeof data.proposedAddress !== "string" ||
        (data.transactionDigest !== undefined &&
          (typeof data.transactionDigest !== "string" || !digestPattern.test(data.transactionDigest))))
      return send(400, { error: "Invalid preflight request" });
    let proposedAddress;
    try { proposedAddress = normalizeSuiAddress(data.proposedAddress); }
    catch { return send(400, { status: "preflight_failed", action: "manual_review_required", paymentAuthorized: false, reason: "Invalid Sui recipient address" }); }
    let relationshipComparison=null;
    if(data.relationshipId!==undefined){
      try{relationshipComparison=await privateRelationships.relationshipPreflight(req,data.relationshipId,proposedAddress);}
      catch(error){return send(error.status||400,{status:"preflight_failed",reason:error.message,paymentAuthorized:false});}
      // Private labels never enter external semantic queries or public records.
      data.counterpartyId=relationshipComparison.relationshipId;
    }
    // Authorization is deliberately NOT accepted from the HTTP caller.
    // Configure a locally controlled file only after independently verifying provenance.
    let authorizations = [];
    if (process.env.VEYRA_AUTHORIZATIONS_FILE) {
      const parsed = JSON.parse(await readFile(process.env.VEYRA_AUTHORIZATIONS_FILE, "utf8"));
      if (!Array.isArray(parsed)) throw new Error("Invalid authorization store");
      authorizations = parsed;
    }
    const [chain, memory, recipientEvidence] = await Promise.all([
      tatum(data.transactionDigest), recall(data.counterpartyId), recallRecipientEvidence(data.counterpartyId, proposedAddress),
    ]);
    let indexedPublications=[];let publicationIndexStatus="not_configured";
    if(publicationLedger)try{indexedPublications=await publicationLedger.recordsForCounterparty(data.counterpartyId);publicationIndexStatus="service_index_window";}catch{publicationIndexStatus="unavailable";}
    // Verify only a bounded receipt window. Other memories stay explicitly unanchored/incomplete.
    const refreshed=await Promise.all(indexedPublications.slice(0,3).map(async item=>{
      try{const verification=await exactReader.read(item.receipt.blobId,item.receipt);await publicationLedger.recordVerification(item.nonce,verification);return {...item,verification};}
      catch{return {...item,verification:null};}
    }));
    const verifiedPublications=refreshed.filter(item=>item.verification?.status==="verified"&&item.verification.payloadHashVerified===true&&item.verification.recordHash===item.receipt.recordHash&&item.verification.blobId===item.receipt.blobId);
    const indexedEvents=verifiedPublications.map(item=>({blobId:item.receipt.blobId,record:item.prepared.candidate}));
    const result = preflightWithEvidence({
      counterpartyId: data.counterpartyId, proposedAddress,
      recalled: memory.records, authorizations,
      evidenceEvents: [...recipientEvidence.events,...indexedEvents],
      walletControlEvents: recipientEvidence.walletControlEvents,
      tatumObservation: chain.observation,
    });
    const assessmentId = randomUUID();
    const checkedAt = new Date().toISOString();
    const providers = { tatum: chain.status, walrus: memory.status, walrusRecipientEvidence: recipientEvidence.status, walrusWalletControl: recipientEvidence.walletControlStatus };
    if (historyPath && !relationshipComparison) {
      try {
        await persistAssessment({
          schema: "veyra.assessment.v1", id: assessmentId, checkedAt,
          counterpartyId: data.counterpartyId, proposedAddress,
          transactionDigest: data.transactionDigest ?? null,
          action: result.action, recipientVerdict: result.recipient.verdict,
          conclusionStatus: result.conclusion.status,
          evidenceBlobIds: result.unifiedEvidence.entries.map(entry => entry.blobId),
          retrievalCompleteness: result.unifiedEvidence.retrievalCompleteness,
          providers, historicalAddressObserved: result.historicalAddressObserved,
          transactionInvestigation: result.transactionInvestigation,
          paymentAuthorized: false,
        });
      } catch {
        return send(503, { status: "preflight_failed", action: "manual_review_required", paymentAuthorized: false, reason: "Assessment journal write failed; result not recorded" });
      }
    }
    return send(200, {
      ...result,
      conclusion: relationshipComparison ? {
        status:relationshipComparison.status,message:relationshipComparison.message,
        source:relationshipComparison.source,action:"manual_review_required",identityVerified:false,
        memoryWritten:false,paymentAuthorized:false,
      } : result.conclusion,
      walrusEvidenceConclusion: result.conclusion,
      reasons: relationshipComparison ? [relationshipComparison.message,...result.reasons] : result.reasons,
      assessmentSaveTicket:!relationshipComparison&&savedAssessments.enabled?savedAssessments.store.ticket({assessmentId,checkedAt,counterpartyId:data.counterpartyId,proposedAddress,conclusion:result.conclusion.status,evidenceBlobIds:result.unifiedEvidence.entries.map(e=>e.blobId),tatumStatus:chain.status,transactionDigest:data.transactionDigest}):null,
      relationshipComparison, assessmentId, checkedAt, historyPersisted: Boolean(historyPath && !relationshipComparison), providers,
      retrieval: {
        mode: verifiedPublications.length ? "semantic_recall_with_receipt_index" : "semantic_recall", completeness: "unknown", exactIdVerification: verifiedPublications.length?"verified_receipt_records":"not_performed",
        receiptVerifiedBlobIds:verifiedPublications.map(item=>item.receipt.blobId),
        publicationIndex:{status:publicationIndexStatus,count:indexedPublications.length,verifiedCount:verifiedPublications.length,completeness:"service_only_bounded_window"},
        status: [memory.status, recipientEvidence.status, recipientEvidence.walletControlStatus].every(status => status === "observed") ? "observed" :
          [memory.status, recipientEvidence.status, recipientEvidence.walletControlStatus].every(status => status === "unavailable") ? "unavailable" : "degraded",
        limitation: "Semantic recall is non-exhaustive. Only receiptVerifiedBlobIds have an exact downloaded/decrypted payload check against a durable receipt hash. Other recalled plaintext is unanchored; the service index is not complete Walrus history.",
      },
      diagnostics: memory.diagnostic ? { walrus: memory.diagnostic } : undefined,
      paymentAuthorized: false,
      limitation: "Historical transactions and local records do not establish current recipient ownership.",
    });
  } catch {
    return send(400, {
      status: "preflight_failed", action: "manual_review_required",
      paymentAuthorized: false, reason: "Preflight could not be completed; verify server configuration",
    });
  }
}
createServer((req, res) => {
  // Admission is checked before parsing or contacting either provider.
  // Local development remains unrestricted; the deployed public service is bounded.
  const providerRead = (req.method === "POST" && req.url === "/v1/preflight") ||
    (req.method === "GET" && (req.url === "/v1/walrus-inventory" || req.url?.startsWith("/v1/evidence-timeline?")));
  const admission = publicMode && providerRead ? limiter.acquire(req.socket.remoteAddress) : null;
  if (admission && !admission.allowed) {
    res.writeHead(429, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "retry-after": String(admission.retryAfter),
    });
    res.end(JSON.stringify({
      status: "preflight_throttled", action: "manual_review_required",
      paymentAuthorized: false, reason: "Assessment capacity reached; retry later",
    }));
    return;
  }
  Promise.resolve().then(() => handler(req, res)).catch(() => {
    if (!res.headersSent) {
      res.writeHead(503, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ status: "preflight_failed", action: "manual_review_required", paymentAuthorized: false, reason: "Assessment temporarily unavailable" }));
    } else res.destroy();
  }).finally(() => admission?.release());
}).listen(port, host, () => {
  if(publicMode&&privateRelationships.enabled&&process.env.MEMWAL_PRIVATE_KEY&&process.env.MEMWAL_ACCOUNT_ID)
    void checkExactReadiness().catch(()=>{}); // Existing public example only; never submits a write.
  console.log(`Veyra preflight API listening on ${host}:${port} (publicMode=${publicMode})`);
});
