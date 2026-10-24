import { normalizeSuiAddress, type RecipientRecord } from "./recipient-check.ts";
import type { UnifiedEvidenceEntry } from "./unified-recipient-evidence.ts";

export type RecipientMemoryEvent = {
  blobId: string;
  record: RecipientRecord;
};
export type RecipientMemoryTimeline = {
  status: "no_memories" | "single_claim" | "multiple_claims_same_address" | "address_change_requires_review";
  entries: Array<{ blobId: string; address: string; confirmedAt: string; confirmationMethod: string; sourceReference?: string; provenance?: string }>;
  distinctAddresses: string[];
  latestClaim: { blobId: string; address: string; confirmedAt: string } | null;
  independentlyVerified: false;
  paymentAuthorized: false;
};

/**
 * Interpret genuine recalled recipient claims as a history, not as an identity oracle.
 * Timestamps supplied by memory writers are user assertions, not trusted ordering
 * proofs. A newer claim NEVER overrides older records or authorizes payment.
 */
export function buildRecipientMemoryTimeline(
  counterpartyId: string,
  recalled: RecipientMemoryEvent[],
  unifiedEntries: UnifiedEvidenceEntry[] = [],
): RecipientMemoryTimeline {
  const unique = new Map<string, RecipientMemoryTimeline["entries"][number]>();
  for (const item of recalled) {
    if (!item || typeof item.blobId !== "string" || !item.blobId ||
        item.record?.counterpartyId !== counterpartyId ||
        item.record.chain !== "sui" || item.record.network !== "mainnet") continue;
    try {
      const address = normalizeSuiAddress(item.record.address);
      const confirmedAt = item.record.confirmation?.confirmedAt;
      const confirmationMethod = item.record.confirmation?.method;
      if (typeof confirmedAt !== "string" || !Number.isFinite(Date.parse(confirmedAt)) ||
          Date.parse(confirmedAt) > Date.now() || typeof confirmationMethod !== "string") continue;
      const key = JSON.stringify([item.blobId, address]);
      if (!unique.has(key)) unique.set(key, {
        blobId: item.blobId, address, confirmedAt, confirmationMethod,
      });
    } catch { /* Invalid claims are not usable evidence. */ }
  }
  // Use the SAME validated recipient baselines as the main comparison. Wallet
  // control and package context never become recipient-history entries.
  for (const entry of unifiedEntries) {
    if (!entry.recipientBaseline || entry.counterpartyId !== counterpartyId) continue;
    const key = JSON.stringify([entry.blobId, entry.address]);
    if (!unique.has(key)) unique.set(key, {
      blobId: entry.blobId, address: entry.address, confirmedAt: entry.observedAt,
      confirmationMethod: entry.provenance, provenance: entry.provenance,
      sourceReference: entry.sourceReference,
    });
  }
  const entries = [...unique.values()].sort((a, b) =>
    Date.parse(a.confirmedAt) - Date.parse(b.confirmedAt) || a.blobId.localeCompare(b.blobId));
  const distinctAddresses = [...new Set(entries.map(e => e.address))];
  const latest = entries.at(-1);
  return {
    status: entries.length === 0 ? "no_memories" :
      distinctAddresses.length > 1 ? "address_change_requires_review" :
      entries.length === 1 ? "single_claim" : "multiple_claims_same_address",
    entries,
    distinctAddresses,
    latestClaim: latest ? { blobId: latest.blobId, address: latest.address, confirmedAt: latest.confirmedAt } : null,
    independentlyVerified: false,
    paymentAuthorized: false,
  };
}
