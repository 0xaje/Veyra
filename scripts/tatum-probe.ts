// Live Tatum RPC connectivity check. Requires an API key supplied via environment.
const key = process.env.TATUM_API_KEY;
if (!key) { console.error("TATUM_API_KEY missing. Create a free key in Tatum Dashboard; do not commit it."); process.exit(2); }
const endpoint = process.env.TATUM_RPC_URL;
if (!endpoint || !endpoint.startsWith("https://")) { console.error("Set TATUM_RPC_URL to an official Tatum RPC endpoint for your selected chain."); process.exit(2); }
const method = process.env.TATUM_RPC_METHOD || "eth_blockNumber";
const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }), signal: AbortSignal.timeout(20000) });
const body: unknown = await response.json();
if (!response.ok || !body || typeof body !== "object" || "error" in body) { console.error("Tatum RPC failed", JSON.stringify(body)); process.exit(1); }
console.log(JSON.stringify({ provider: "tatum", endpoint: new URL(endpoint).host, method, response: body, checkedAt: new Date().toISOString() }, null, 2));
