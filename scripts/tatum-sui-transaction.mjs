// Fetch genuine Sui Mainnet transaction evidence using Tatum's authenticated JSON-RPC.
// Usage: node scripts/tatum-sui-transaction.mjs <transaction-digest>
// Read-only. No private keys or API keys are printed or persisted.
const digest = process.argv[2];
if (!digest || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(digest)) {
  console.error("Usage: node scripts/tatum-sui-transaction.mjs <Sui base58 transaction digest>");
  process.exit(2);
}
const key = process.env.TATUM_API_KEY;
if (!key) {
  console.error("TATUM_API_KEY missing. Configure it privately in this terminal.");
  process.exit(2);
}
const endpoint = new URL(process.env.TATUM_SUI_RPC_URL || "https://sui-mainnet.gateway.tatum.io");
if (endpoint.protocol !== "https:") throw new Error("RPC endpoint must use HTTPS");
let response;
try {
  response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "sui_getTransactionBlock",
      params: [digest, { showInput: true, showEffects: true, showBalanceChanges: true, showEvents: false }],
    }),
    signal: AbortSignal.timeout(30000),
  });
} catch (error) {
  console.error(JSON.stringify({ status: "network_error", code: error?.cause?.code ?? null, message: error.message, endpointHost: endpoint.host }));
  process.exit(1);
}
let body;
try { body = await response.json(); }
catch { console.error(JSON.stringify({ status: "invalid_response", httpStatus: response.status })); process.exit(1); }
if (!response.ok || body.error || !body.result || body.result.digest !== digest) {
  console.error(JSON.stringify({ status: "failed", httpStatus: response.status, rpcError: body.error ?? null, digest }));
  process.exit(1);
}
const tx = body.result;
console.log(JSON.stringify({
  status: "verified", provider: "tatum", network: "sui-mainnet", method: "sui_getTransactionBlock",
  digest: tx.digest, checkpoint: tx.checkpoint ?? null, timestampMs: tx.timestampMs ?? null,
  sender: tx.transaction?.data?.sender ?? null,
  executionStatus: tx.effects?.status?.status ?? null,
  executionError: tx.effects?.status?.error ?? null,
  balanceChanges: tx.balanceChanges ?? [],
  endpointHost: endpoint.host, checkedAt: new Date().toISOString(),
  limitation: "Observed transaction execution and balance changes do not establish recipient safety.",
}, null, 2));
