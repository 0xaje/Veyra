// Local-only read-only Veyra preflight HTTP API. Never signs or submits payments.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { normalizeSuiAddress } from "../src/core/recipient-check.ts";
import { preflightWithEvidence } from "../src/core/evidence-preflight.ts";

const port = Number(process.env.VEYRA_PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid VEYRA_PORT");
const maxBody = 8192;
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
  } catch {
    return { records: [], status: "unavailable" };
  }
}

async function handler(req, res) {
  const send = (status, data) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify(data));
  };
  if (req.method === "GET" && req.url === "/health")
    return send(200, { status: "running", paymentAuthorized: false });
  if (req.method !== "POST" || req.url !== "/v1/preflight")
    return send(404, { error: "Not found" });
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > maxBody) return send(413, { error: "Request too large" });
    }
    const data = JSON.parse(body);
    if (typeof data.counterpartyId !== "string" || !data.counterpartyId.trim() ||
        data.counterpartyId.length > 128 || typeof data.proposedAddress !== "string" ||
        (data.transactionDigest !== undefined &&
          (typeof data.transactionDigest !== "string" || !digestPattern.test(data.transactionDigest))))
      return send(400, { error: "Invalid preflight request" });
    const proposedAddress = normalizeSuiAddress(data.proposedAddress);
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
    return send(200, {
      ...result, providers: { tatum: chain.status, walrus: memory.status },
      paymentAuthorized: false,
      limitation: "Historical transactions and local records do not establish current recipient ownership.",
    });
  } catch {
    return send(400, {
      status: "preflight_failed", action: "manual_review_required",
      paymentAuthorized: false, reason: "Invalid request or local configuration",
    });
  }
}
createServer((req, res) => { void handler(req, res); }).listen(port, "127.0.0.1", () => {
  console.log(`Veyra read-only preflight API listening on http://127.0.0.1:${port}`);
});
