# Veyra

**Intelligence that remembers. Protection that evolves.**

Veyra is a transaction preflight and evidence-backed memory agent for the Tatum × Walrus Total Recall hackathon.

## Product contract

- Use genuine blockchain RPC responses from Tatum, never invented balances, transactions, or risk signals.
- Persist and retrieve actual memories using the official Walrus integration. Do not substitute local storage and call it Walrus.
- Distinguish user-reported outcomes from independently verified onchain facts.
- Do not call an address or transaction *safe* solely because it was previously used.
- Do not store wallet private keys, seed phrases, or sensitive user information in public memory blobs.
- Record network, timestamps, transaction hashes, storage identifiers, and provenance for reproducible evidence.
- If a provider is unavailable, return a transparent error rather than fabricated data.

## First acceptance test

1. Query a real transaction or address through a documented Tatum endpoint.
2. Persist a real, privacy-safe assessment memory to the required Walrus network.
3. Start a fresh process and retrieve the exact memory using its storage reference.
4. Produce a new assessment that cites the retrieved memory and fresh onchain evidence.
5. Preserve request IDs, network names, storage references, and verification results (without secrets).

**Status:** repository initialized. Live provider integrations are not yet implemented or verified.

## Proposed components

- `apps/web`: transaction preflight and memory timeline UI
- `apps/api`: Tatum data access, evidence validation, risk assessment, and memory orchestration
- `packages/core`: typed assessments and provenance contracts
- `docs`: integration research, architecture, and proof records

Implementation will follow validation of current official SDKs, network requirements, and credentials.
