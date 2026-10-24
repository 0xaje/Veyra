import { normalizeSuiAddress } from "./recipient-check.ts";
import type { RecalledRecipient } from "./recipient-preflight.ts";

export type RecalledEvidence = { blobId: string; record: unknown };
export type UnifiedEvidenceEntry = {
  blobId: string;
  kind: "recipient_claim" | "recipient_observation" | "wallet_control";
  address: string;
  counterpartyId: string | null;
  provenance: string;
  controlProven: boolean;
  recipientRelationshipProven: false;
};
export type UnifiedEvidenceAssessment = {
  status: "no_evidence" | "matches_observed_address" | "differs_from_observed_address" | "conflicting_observations";
  retrievalCompleteness: "unknown";
  entries: UnifiedEvidenceEntry[];
  observedAddresses: string[];
  walletControlObserved: boolean;
  identityVerified: false;
  paymentAuthorized: false;
};

/** Read-only interpretation of existing Walrus record formats. Never upgrades trust. */
export function unifyRecipientEvidence(input: {
  counterpartyId: string;
  proposedAddress: string;
  recipientClaims?: RecalledRecipient[];
  evidenceEvents?: RecalledEvidence[];
  walletControlEvents?: RecalledEvidence[];
}): UnifiedEvidenceAssessment {
  const proposed = normalizeSuiAddress(input.proposedAddress);
  const entries: UnifiedEvidenceEntry[] = [];
  const seen = new Set<string>();
  const add = (item: RecalledEvidence, kind: UnifiedEvidenceEntry["kind"], address: string, id: string | null, provenance: string, controlProven: boolean) => {
    if (!item.blobId || typeof item.blobId !== "string" || seen.has(item.blobId)) return;
    seen.add(item.blobId);
    entries.push({ blobId: item.blobId, kind, address, counterpartyId: id, provenance, controlProven, recipientRelationshipProven: false });
  };
  for (const item of input.recipientClaims ?? []) {
    const r = item.record;
    if (r?.chain !== "sui" || r.network !== "mainnet" || r.counterpartyId !== input.counterpartyId ||
        typeof r.confirmation?.reference !== "string" || !r.confirmation.reference.trim() ||
        typeof r.confirmation?.confirmedAt !== "string" || !Number.isFinite(Date.parse(r.confirmation.confirmedAt)) ||
        Date.parse(r.confirmation.confirmedAt) > Date.now()) continue;
    try { add(item, "recipient_claim", normalizeSuiAddress(r.address), r.counterpartyId, r.confirmation.method, false); } catch {}
  }
  for (const item of input.evidenceEvents ?? []) {
    const r = item.record as Record<string, any> | null;
    if (r?.type !== "veyra.recipient_evidence.v1" || r.chain !== "sui" || r.network !== "mainnet" ||
        r.counterpartyId !== input.counterpartyId || r.addressKind !== "wallet" ||
        r.eventType !== "recipient_reconfirmed" || r.source?.kind !== "direct_owner_confirmation" ||
        typeof r.source?.reference !== "string" || !r.source.reference.trim() ||
        typeof r.source?.observedAt !== "string" || !Number.isFinite(Date.parse(r.source.observedAt)) ||
        Date.parse(r.source.observedAt) > Date.now()) continue;
    try { add(item, "recipient_observation", normalizeSuiAddress(r.address), r.counterpartyId, "direct_owner_confirmation_claim", false); } catch {}
  }
  for (const item of input.walletControlEvents ?? []) {
    const r = item.record as Record<string, any> | null;
    if (r?.type !== "veyra.wallet_control_memory.v1" || r.chain !== "sui" || r.network !== "mainnet" ||
        r.verification !== "valid_signature_for_purpose_bound_challenge" ||
        r.provenance !== "locally_reverified_portable_signature" ||
        typeof r.signedChallengeExpiresAt !== "string" || !Number.isFinite(Date.parse(r.signedChallengeExpiresAt))) continue;
    try { add(item, "wallet_control", normalizeSuiAddress(r.address), null, "record_claims_locally_reverified_signature", true); } catch {}
  }
  const observedAddresses = [...new Set(entries.filter(e => e.kind !== "wallet_control").map(e => e.address))];
  return {
    status: observedAddresses.length === 0 ? "no_evidence" :
      observedAddresses.length > 1 ? "conflicting_observations" :
      observedAddresses[0] === proposed ? "matches_observed_address" : "differs_from_observed_address",
    retrievalCompleteness: "unknown",
    entries,
    observedAddresses,
    walletControlObserved: entries.some(e => e.kind === "wallet_control" && e.address === proposed),
    identityVerified: false,
    paymentAuthorized: false,
  };
}
