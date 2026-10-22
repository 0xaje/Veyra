# Tatum Sui gRPC migration smoke test

The legacy Tatum JSON-RPC gateway returned RPC error `-16503 No healthy upstream available`. Tatum documents a separate Sui gRPC Mainnet gateway. This experimental branch adds a **read-only** smoke test and does not replace existing scripts until real output is verified.

## WSL setup

```bash
cd ~/Veyra
git status --short
# Keep local uncommitted work; do not switch branches until it is safely preserved.
npm install --no-save --package-lock=false @grpc/grpc-js @grpc/proto-loader
git clone --depth 1 https://github.com/MystenLabs/sui-apis.git /tmp/veyra-sui-apis
find /tmp/veyra-sui-apis -name ledger_service.proto
```

Set `SUI_PROTO_DIR` to the directory containing the `sui/` folder (usually `/tmp/veyra-sui-apis/proto`). Run without printing credentials:

```bash
SUI_PROTO_DIR=/tmp/veyra-sui-apis/proto node --env-file=.env.local scripts/tatum-sui-grpc.mjs
```

For a known genuine digest:

```bash
SUI_PROTO_DIR=/tmp/veyra-sui-apis/proto node --env-file=.env.local scripts/tatum-sui-grpc.mjs '<REAL_SUI_DIGEST>'
```

The first command requests a checkpoint, the second a transaction with its transaction data, effects, and balance changes. The output is **provider-observed**, not independent consensus verification. No payment is authorized.

**Important:** This script has not yet been run against Tatum with the user's credentials. It may need adjustment to the actual proto revision and service response. Do not report successful live gRPC integration until it produces genuine evidence.

Sources:
- https://docs.tatum.io/oa/reference/sui-grpc
- https://docs.tatum.io/oa/docs/sui-migration-guide-from-json-rpc-to-grpc
- https://www.docs.sui.io/develop/accessing-data/grpc/grpc-migration-cookbook
