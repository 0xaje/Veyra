// Read-only Tatum Sui gRPC checkpoint and transaction evidence.
// Requires: npm install @grpc/grpc-js @grpc/proto-loader
// Requires: SUI_PROTO_DIR pointing to the root of the official sui-apis/proto directory.
// Usage: node --env-file=.env.local scripts/tatum-sui-grpc.mjs [transaction-digest]
// Never prints API keys. No transaction submission.
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
const require = createRequire(import.meta.url);
const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");
const endpoint = process.env.TATUM_SUI_GRPC_HOST || "sui-mainnet-grpc.gateway.tatum.io:443";
const key = process.env.TATUM_API_KEY;
const protoDir = process.env.SUI_PROTO_DIR && resolve(process.env.SUI_PROTO_DIR);
const digest = process.argv[2];
if (!key) { console.error("TATUM_API_KEY is missing"); process.exit(2); }
if (!protoDir || !existsSync(join(protoDir, "sui/rpc/v2/ledger_service.proto"))) {
  console.error("Set SUI_PROTO_DIR to the official sui-apis/proto directory"); process.exit(2);
}
if (!/^[a-zA-Z0-9.-]+:443$/.test(endpoint)) { console.error("Invalid TLS gRPC host"); process.exit(2); }
if (digest && !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(digest)) {
  console.error("Invalid base58 Sui transaction digest"); process.exit(2);
}
const definition = loader.loadSync(join(protoDir, "sui/rpc/v2/ledger_service.proto"), {
  includeDirs: [protoDir], keepCase: false, longs: String, enums: String,
  defaults: false, oneofs: true,
});
const pkg = grpc.loadPackageDefinition(definition);
const client = new pkg.sui.rpc.v2.LedgerService(endpoint, grpc.credentials.createSsl());
const metadata = new grpc.Metadata();
metadata.add("x-api-key", key);
function call(method, request) {
  return new Promise((res, rej) => {
    client[method](request, metadata, { deadline: Date.now() + 20000 }, (err, response) => {
      if (err) rej(new Error(`gRPC ${err.code ?? "unknown"}: ${err.details || err.message}`));
      else res(response);
    });
  });
}
try {
  const response = digest
    ? await call("getTransaction", {
        digest,
        readMask: { paths: ["digest", "transaction", "effects", "balance_changes"] },
      })
    : await call("getCheckpoint", {
        readMask: { paths: ["sequence_number", "digest", "summary"] },
      });
  const record = digest ? response.transaction : response.checkpoint;
  if (!record || (digest && record.digest !== digest)) throw new Error("Missing or mismatched verified response");
  console.log(JSON.stringify({
    status: "observed", provider: "tatum", network: "sui-mainnet", transport: "grpc",
    method: digest ? "LedgerService/GetTransaction" : "LedgerService/GetCheckpoint",
    endpointHost: endpoint, requestedDigest: digest || null, evidence: record,
    checkedAt: new Date().toISOString(),
    limitation: "Provider-observed blockchain evidence does not establish recipient ownership or safety.",
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", provider: "tatum", transport: "grpc",
    endpointHost: endpoint, reason: error.message, checkedAt: new Date().toISOString() }, null, 2));
  process.exitCode = 1;
} finally {
  client.close();
}
