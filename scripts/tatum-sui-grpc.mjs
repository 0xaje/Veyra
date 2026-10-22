// Read-only Tatum Sui gRPC checkpoint and transaction evidence.
// Requires: npm install @grpc/grpc-js @grpc/proto-loader
// Requires: SUI_PROTO_DIR pointing to the root of the official sui-apis/proto directory.
// Usage: node --env-file=.env.local scripts/tatum-sui-grpc.mjs [transaction-digest|--auto]
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
const auto = digest === "--auto";
const MAX_CANDIDATES = 30;
const MAX_CHECKPOINTS = 5;
const ZERO_ADDRESS = `0x${"0".repeat(64)}`;
if (!key) { console.error("TATUM_API_KEY is missing"); process.exit(2); }
if (!protoDir || !existsSync(join(protoDir, "sui/rpc/v2/ledger_service.proto"))) {
  console.error("Set SUI_PROTO_DIR to the official sui-apis/proto directory"); process.exit(2);
}
if (!/^[a-zA-Z0-9.-]+:443$/.test(endpoint)) { console.error("Invalid TLS gRPC host"); process.exit(2); }
if (digest && !auto && !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(digest)) {
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
  const getTransaction = async (txDigest) => {
    const result = await call("getTransaction", {
      digest: txDigest,
      readMask: { paths: ["digest", "transaction", "effects", "balance_changes"] },
    });
    if (!result.transaction || result.transaction.digest !== txDigest) {
      throw new Error("Missing or mismatched transaction digest");
    }
    return result.transaction;
  };
  let checkpoint = null;
  let record = null;
  let selectedDigest = digest && !auto ? digest : null;
  let inspected = 0;
  if (auto) {
    const latest = (await call("getCheckpoint", {
      readMask: { paths: ["sequence_number", "digest", "transactions"] },
    })).checkpoint;
    if (!latest?.sequenceNumber) throw new Error("Latest checkpoint sequence unavailable");
    for (let offset = 0; offset < MAX_CHECKPOINTS && !record; offset++) {
      checkpoint = offset === 0 ? latest : (await call("getCheckpoint", {
        sequenceNumber: String(BigInt(latest.sequenceNumber) - BigInt(offset)),
        readMask: { paths: ["sequence_number", "digest", "transactions"] },
      })).checkpoint;
      const candidates = (checkpoint?.transactions ?? [])
        .map(t => typeof t === "string" ? t : t.digest)
        .filter(Boolean).slice(0, MAX_CANDIDATES);
      for (const candidate of candidates) {
        inspected++;
        const tx = await getTransaction(candidate);
        const sender = tx.transaction?.sender;
        const changes = tx.balanceChanges ?? [];
        if (sender && sender !== ZERO_ADDRESS && changes.length > 0) {
          record = tx;
          selectedDigest = candidate;
          break;
        }
      }
    }
    if (!record) throw new Error(`No user-originated transaction with balance changes in ${inspected} inspected transactions across up to ${MAX_CHECKPOINTS} checkpoints`);
  } else if (selectedDigest) {
    record = await getTransaction(selectedDigest);
  } else {
    record = (await call("getCheckpoint", {
      readMask: { paths: ["sequence_number", "digest", "summary"] },
    })).checkpoint;
    if (!record) throw new Error("Checkpoint unavailable");
  }
  console.log(JSON.stringify({
    status: "observed", provider: "tatum", network: "sui-mainnet", transport: "grpc",
    method: selectedDigest ? "LedgerService/GetTransaction" : "LedgerService/GetCheckpoint",
    endpointHost: endpoint, requestedDigest: selectedDigest || null,
    discoveryCheckpoint: auto ? checkpoint.sequenceNumber : null,
    inspectedTransactions: auto ? inspected : null,
    evidence: selectedDigest ? {
      digest: record.digest,
      sender: record.transaction?.sender ?? null,
      executionStatus: record.effects?.status?.success === true ? "success" : record.effects?.status?.failure ? "failure" : "unknown",
      balanceChanges: (record.balanceChanges ?? []).map(change => ({ address: change.address ?? null, amount: change.amount ?? null, coinType: change.coinType ?? null })),
    } : {
      sequenceNumber: record.sequenceNumber ?? record.summary?.sequenceNumber ?? null,
      digest: record.digest ?? record.summary?.digest ?? null,
      epoch: record.summary?.epoch ?? null,
      totalNetworkTransactions: record.summary?.totalNetworkTransactions ?? null,
      timestamp: record.summary?.timestamp ?? null,
    },
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
