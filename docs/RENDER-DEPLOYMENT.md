# Render deployment runbook

Veyra currently serves its HTML frontend and JSON API from one Node process. The repository includes a Render Blueprint (render.yaml). The first deployment is deliberately read-only: `VEYRA_PUBLIC_MODE=true` disables recipient memory writes and assessment history for all public visitors.

## Prerequisites and blockers

1. Deploy a paid Render web service if consistent judge access is required. Free services may sleep.
2. Use the Render Blueprint and connect the GitHub repository. Verify the desired branch is `feat/tatum-sui-grpc` or merge it to the intended production branch first.
3. Configure legitimate `MEMWAL_PRIVATE_KEY` and `MEMWAL_ACCOUNT_ID` in Render's secret environment settings, never in Git. These credentials are used for recall; the public API blocks writes.
4. For Tatum, configure `TATUM_API_KEY` **and** `SUI_PROTO_DIR` pointing to the official sui-apis/proto files available inside the deployed filesystem. **The repository does not yet bundle the official proto dependency, so hosted gRPC will remain unavailable until this is addressed.** Do not represent the deployment as fully integrated before validating a live transaction digest.
5. Confirm that the Walrus SDK's network, namespace, and credentials match the genuine previously stored memory. Do not infer Mainnet provenance from successful recall alone.
6. Do not set `VEYRA_HISTORY_FILE` or an authorization file in public mode. Public history is deliberately disabled.

## Deployment validation

- Open the HTTPS home page, /docs, /memory, /history, and /health in a private browser.
- /health should return `publicMode: true`, `memoryWritesEnabled: false`, and `paymentAuthorized: false`.
- POST /v1/recipient-memory must return HTTP 403 without writing anything.
- POST /v1/preflight with a real known counterparty and Sui Mainnet address; confirm actual Walrus provider status.
- With Tatum configured and official proto files deployed, submit a real historical Sui transaction digest and confirm actual Tatum provider status.
- Verify one-character address difference yields review-required and never payment authorization.
- Check that /v1/history contains no private assessments.

## Not yet implemented

Production request throttling, full authentication for memory writes, a persistent production history store, and deployment-side verification of Tatum proto assets. Until those exist, keep public mode read-only and do not promise production-grade abuse resistance. A public read-only endpoint can still incur provider charges, so monitor traffic and provider limits.
