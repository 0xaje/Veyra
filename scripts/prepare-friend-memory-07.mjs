// Prepare Veyra memory #7 using the operator's actual local observation time.
// No credentials, provider requests, or Walrus writes. Run once for review.
// Usage: node --experimental-strip-types scripts/prepare-friend-memory-07.mjs
import { prepareRecipientEvidenceEvent } from "../src/core/recipient-evidence-event.ts";

const observedAt = new Date().toISOString();
const record = prepareRecipientEvidenceEvent({
  counterpartyId: "friend-1-sui-recipient",
  address: "0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7f",
  addressKind: "wallet",
  eventType: "recipient_reconfirmed",
  source: {
    kind: "direct_owner_confirmation",
    reference: "Operator reports friend confirmed intended Sui receiving address and consented to public Walrus storage; original message not independently reviewed",
    observedAt,
  },
  userApprovedStorage: true, // Validation input only. This script cannot submit a write.
});
console.log(JSON.stringify({
  status: "prepared_not_stored",
  purpose: "Operator-relayed consented recipient observation; no wallet-control proof",
  record,
  nextStep: "Review this exact public record before separately approving a one-time local MemWal write.",
  walrusMemoryWritten: false,
}, null, 2));
