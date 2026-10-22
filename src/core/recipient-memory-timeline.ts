import { normalizeSuiAddress, type RecipientRecord } from "./recipient-check.ts";

export type RecipientMemoryEvent = {
  blobId: string;
  record: RecipientRecord;
};
export type RecipientMemoryTimeline = {
  status: "no_memories" | "single_claim" | "multiple_claims_same_address" | "address_change_requires_review";
  entries: Array<{ blobId: string; address: string; confirmedAt: string; confirmationMethod: string }>;
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
      if (!unique.has(item.blobId)) unique.set(item.blobId, {
        blobId: item.blobId, address, confirmedAt, confirmationMethod,
      });
    } catch { /* Invalid claims are not usable evidence. */ }
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
