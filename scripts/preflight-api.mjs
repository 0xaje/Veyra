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

const port = Number(process.env.PORT || process.env.VEYRA_PORT || 8787);
const publicMode = process.env.VEYRA_PUBLIC_MODE === "true";
const host = process.env.VEYRA_HOST || (publicMode ? "0.0.0.0" : "127.0.0.1");
if (!["127.0.0.1", "0.0.0.0"].includes(host)) throw new Error("Invalid VEYRA_HOST");
if (host === "0.0.0.0" && !publicMode) throw new Error("Public binding requires VEYRA_PUBLIC_MODE=true");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid VEYRA_PORT");
const maxBody = 8192;
const limiter = createPreflightLimiter({
  perClient: Number(process.env.VEYRA_PREFLIGHT_PER_MINUTE ?? 8),
  maxConcurrent: Number(process.env.VEYRA_PREFLIGHT_CONCURRENCY ?? 2),
});
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

async function handler(req, res) {
  const send = (status, data) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify(data));
  };
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html" || req.url === "/docs" || req.url === "/history" || req.url === "/memory")) {
    try {
      const html = await readFile(resolve(webRoot, req.url === "/docs" ? "docs.html" : req.url === "/history" ? "history.html" : req.url === "/memory" ? "memory.html" : "index.html"), "utf8");
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      });
      return res.end(html);
    } catch { return send(503, { error: "Interface unavailable" }); }
  }
  if (req.method === "GET" && req.url === "/v1/history") {
    if (publicMode) return send(200, { enabled: false, records: [], privacy: "Public assessment history disabled" });
    try { return send(200, await loadHistory()); }
    catch { return send(503, { error: "Assessment journal unavailable" }); }
  }
  if (req.method === "GET" && req.url === "/health")
    return send(200, { status: "running", paymentAuthorized: false, publicMode, memoryWritesEnabled: !publicMode });
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
    if (typeof data.counterpartyId !== "string" || !data.counterpartyId.trim() ||
        data.counterpartyId.length > 128 || typeof data.proposedAddress !== "string" ||
        (data.transactionDigest !== undefined &&
          (typeof data.transactionDigest !== "string" || !digestPattern.test(data.transactionDigest))))
      return send(400, { error: "Invalid preflight request" });
    let proposedAddress;
    try { proposedAddress = normalizeSuiAddress(data.proposedAddress); }
    catch { return send(400, { status: "preflight_failed", action: "manual_review_required", paymentAuthorized: false, reason: "Invalid Sui recipient address" }); }
    // Authorization is deliberately NOT accepted from the HTTP caller.
    // Configure a locally controlled file only after independently verifying provenance.
    let authorizations = [];
    if (process.env.VEYRA_AUTHORIZATIONS_FILE) {
      const parsed = JSON.parse(await readFile(process.env.VEYRA_AUTHORIZATIONS_FILE, "utf8"));
      if (!Array.isArray(parsed)) throw new Error("Invalid authorization store");
      authorizations = parsed;
    }
    const [chain, memory] = await Promise.all([
      tatum(data.transactionDigest), recall(data.counterpartyId),
    ]);
    const result = preflightWithEvidence({
      counterpartyId: data.counterpartyId, proposedAddress,
      recalled: memory.records, authorizations,
      tatumObservation: chain.observation,
    });
    const assessmentId = randomUUID();
    const checkedAt = new Date().toISOString();
    const providers = { tatum: chain.status, walrus: memory.status };
    if (historyPath) {
      try {
        await persistAssessment({
          schema: "veyra.assessment.v1", id: assessmentId, checkedAt,
          counterpartyId: data.counterpartyId, proposedAddress,
          transactionDigest: data.transactionDigest ?? null,
          action: result.action, recipientVerdict: result.recipient.verdict,
          providers, historicalAddressObserved: result.historicalAddressObserved,
          transactionInvestigation: result.transactionInvestigation,
          paymentAuthorized: false,
        });
      } catch {
        return send(503, { status: "preflight_failed", action: "manual_review_required", paymentAuthorized: false, reason: "Assessment journal write failed; result not recorded" });
      }
    }
    return send(200, {
      ...result, assessmentId, checkedAt, historyPersisted: Boolean(historyPath), providers: { tatum: chain.status, walrus: memory.status },
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
  const admission = publicMode && req.method === "POST" && req.url === "/v1/preflight"
    ? limiter.acquire(req.socket.remoteAddress) : null;
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
  console.log(`Veyra preflight API listening on ${host}:${port} (publicMode=${publicMode})`);
});
