# Veyra architecture and evidence contract

## Data flow

1. User supplies chain, network, recipient address, and intended asset/amount.
2. API validates all inputs; chain adapter queries a real Tatum RPC endpoint.
3. Assessment engine distinguishes verified facts, user claims, unknowns, and heuristics.
4. Memory adapter retrieves relevant Walrus memories, verifying identity and provenance before use.
5. Engine produces a cautious recommendation with references to evidence and uncertainty.
6. With user consent, a privacy-safe assessment/outcome is written to Walrus and its storage identifier is recorded.

## Memory schema (proposed)

`version`, `createdAt`, `chain`, `network`, `recipientFingerprint`, `assessment`, `evidenceRefs`, `outcomeSource`, `outcome`, `previousMemoryRefs`.

Never publish raw personal transaction notes or sensitive identity information. A recipient fingerprint must be keyed or otherwise designed to resist address enumeration; plain hashing a public address is not sufficient privacy protection.

## Trust boundaries

- User-reported outcomes are unverified until supported by independent evidence.
- Prior successful transfers do not establish recipient trustworthiness.
- Never request private keys or seed phrases.
- No live transfer execution in the initial MVP; analysis only.
- Fail closed and report provider failures honestly.

## Milestone 1 evidence

Record the exact API route, chain/network, response timestamp, onchain transaction identifier, Walrus storage reference, retrieval proof, and the fresh-session test output. Redact secrets and personal data.

**Not yet implemented:** provider adapters, persistence, retrieval, risk engine, and UI.
