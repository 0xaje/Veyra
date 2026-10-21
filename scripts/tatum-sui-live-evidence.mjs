// Discover a genuine transaction from a live Sui checkpoint through Tatum.
// Read-only; does not log API credentials.
const key = process.env.TATUM_API_KEY;
if (!key) { console.error("TATUM_API_KEY missing. Set it privately in this terminal."); process.exit(2); }
const endpoint = new URL(process.env.TATUM_SUI_RPC_URL || "https://sui-mainnet.gateway.tatum.io");
if (endpoint.protocol !== "https:") throw new Error("RPC endpoint must use HTTPS");
async function rpc(method, params) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw new Error(`Network error (${error?.cause?.code || error.message}) while calling ${method}`);
  }
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`Non-JSON response (HTTP ${response.status}) from ${method}`); }
  if (!response.ok || body.error) throw new Error(`${method} failed (HTTP ${response.status}): ${JSON.stringify(body.error ?? body)}`);
  return body.result;
}
try {
  const height = await rpc("sui_getLatestCheckpointSequenceNumber", []);
  if (!/^\d+$/.test(String(height))) throw new Error("Invalid checkpoint sequence number");
  let checkpoint, tx;
  const zeroSender = "0x" + "0".repeat(64);
  let inspected = 0;
  for (let offset = 0; offset < 5 && !tx; offset++) {
    const candidateCheckpoint = await rpc("sui_getCheckpoint", [String(BigInt(height) - BigInt(offset))]);
    for (const digest of (candidateCheckpoint?.transactions ?? []).slice(0, 30)) {
      inspected++;
      const candidate = await rpc("sui_getTransactionBlock", [digest, {
        showInput: true, showEffects: true, showBalanceChanges: true, showEvents: false,
      }]);
      const sender = candidate?.transaction?.data?.sender;
      if (candidate?.digest === digest && typeof sender === "string" && sender !== zeroSender && Array.isArray(candidate.balanceChanges) && candidate.balanceChanges.length > 0) {
        checkpoint = candidateCheckpoint;
        tx = candidate;
        break;
      }
    }
  }
  if (!tx) throw new Error(`No non-system transaction with balance changes found among ${inspected} inspected transactions; no evidence fabricated`);
  const digest = tx.digest;
  console.log(JSON.stringify({
    status: "verified", provider: "tatum", network: "sui-mainnet",
    checkpoint: checkpoint.sequenceNumber, digest, transactionKind: tx.transaction?.data?.transaction?.kind ?? null,
    sender: tx.transaction?.data?.sender ?? null,
    executionStatus: tx.effects?.status?.status ?? null,
    timestampMs: tx.timestampMs ?? null,
    balanceChanges: tx.balanceChanges ?? [],
    checkedAt: new Date().toISOString(),
    limitation: "A genuine confirmed transaction is not proof that any wallet or recipient is safe.",
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: error.message, endpointHost: endpoint.host }, null, 2));
  process.exitCode = 1;
}
