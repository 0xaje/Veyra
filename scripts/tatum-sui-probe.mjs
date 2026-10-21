// Read-only Sui JSON-RPC connectivity probe. Never logs the API key.
const key = process.env.TATUM_API_KEY;
if (!key) {
  console.error("TATUM_API_KEY missing. Set it privately in your terminal.");
  process.exit(2);
}
const endpoint = process.env.TATUM_SUI_RPC_URL || "https://sui-mainnet.gateway.tatum.io";
const url = new URL(endpoint);
if (url.protocol !== "https:") throw new Error("RPC endpoint must use HTTPS");
let response;
try {
  response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": key },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sui_getLatestCheckpointSequenceNumber", params: [] }),
  signal: AbortSignal.timeout(20000),
  });
} catch (error) {
  const cause = error?.cause;
  console.error(JSON.stringify({ status: "network_error", endpointHost: url.host, code: cause?.code || error?.code || null, message: error?.message || String(error), hint: "Check IPv4 connectivity, DNS, firewall, or try the same endpoint from Windows. No HTTP response received." }, null, 2));
  process.exit(1);
}
const body = await response.json();
if (!response.ok || body.error || typeof body.result !== "string" || !/^\d+$/.test(body.result)) {
  console.error(JSON.stringify({ status: "failed", httpStatus: response.status, rpcError: body.error ?? null, endpointHost: url.host }));
  process.exit(1);
}
console.log(JSON.stringify({ status: "verified", provider: "tatum", network: "sui-mainnet", method: "sui_getLatestCheckpointSequenceNumber", checkpoint: body.result, endpointHost: url.host, checkedAt: new Date().toISOString() }, null, 2));
