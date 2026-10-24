import { normalizeSuiAddress } from "./recipient-check.ts";
import type { RecalledRecipient } from "./recipient-preflight.ts";

export type RecalledEvidence = { blobId: string; record: unknown };
export type UnifiedEvidenceEntry = {
  blobId: string;
  kind: "recipient_claim" | "recipient_observation" | "informational_observation" | "wallet_control";
  address: string;
  counterpartyId: string | null;
  provenance: string;
  controlProven: false;
  recipientBaseline: boolean;
  observedAt: string;
  sourceReference: string;
  freshness: "historical_claim" | "unexpired_claim" | "expired_claim";
  signedChallengeExpiresAt: string | null;
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
  now?: number;
  recipientClaims?: RecalledRecipient[];
  evidenceEvents?: RecalledEvidence[];
  walletControlEvents?: RecalledEvidence[];
}): UnifiedEvidenceAssessment {
  const proposed = normalizeSuiAddress(input.proposedAddress);
  const now = input.now ?? Date.now();
  const past = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now;
  const nonempty = (value: unknown): value is string => typeof value === "string" && !!value.trim();
  const entries: UnifiedEvidenceEntry[] = [];
  const add = (item: RecalledEvidence, entry: Omit<UnifiedEvidenceEntry, "blobId" | "controlProven" | "recipientRelationshipProven">) => {
    if (!nonempty(item?.blobId)) return;
    // Deduplicate only identical interpretations. A repeated blob ID with different
    // addresses must not hide a conflict in unverified semantic recall.
    if (entries.some(e => e.blobId === item.blobId && e.kind === entry.kind && e.address === entry.address)) return;
    entries.push({ blobId: item.blobId, ...entry, controlProven: false, recipientRelationshipProven: false });
  };
  for (const item of input.recipientClaims ?? []) {
    const r = item?.record;
    if (r?.chain !== "sui" || r.network !== "mainnet" || r.counterpartyId !== input.counterpartyId ||
        typeof r.confirmation?.reference !== "string" || !r.confirmation.reference.trim() ||
        !nonempty(r.confirmation?.method) || !past(r.confirmation?.confirmedAt)) continue;
    try { add(item, { kind: "recipient_claim", address: normalizeSuiAddress(r.address), counterpartyId: r.counterpartyId, provenance: r.confirmation.method,
      recipientBaseline: true, observedAt: r.confirmation.confirmedAt, sourceReference: r.confirmation.reference,
      freshness: "historical_claim", signedChallengeExpiresAt: null }); } catch {}
  }
  for (const item of input.evidenceEvents ?? []) {
    const r = item?.record as Record<string, any> | null;
    if (r?.type !== "veyra.recipient_evidence.v1" || r.chain !== "sui" || r.network !== "mainnet" ||
        r.counterpartyId !== input.counterpartyId ||
        r.trust !== "informational_unverified" || r.paymentAuthorized !== false ||
        !["wallet", "package", "shared_object"].includes(r.addressKind) ||
        !["source_observed", "recipient_reconfirmed", "mismatch_reviewed"].includes(r.eventType) ||
        !["direct_owner_confirmation", "public_official_document", "local_assessment"].includes(r.source?.kind) ||
        !nonempty(r.source?.reference) || !past(r.source?.observedAt)) continue;
    const baseline = r.addressKind === "wallet" && r.eventType === "recipient_reconfirmed" && r.source.kind === "direct_owner_confirmation";
    try { add(item, { kind: baseline ? "recipient_observation" : "informational_observation", address: normalizeSuiAddress(r.address),
      counterpartyId: r.counterpartyId, provenance: baseline ? "direct_owner_confirmation_claim" : `${r.addressKind}:${r.eventType}:${r.source.kind}`,
      recipientBaseline: baseline, observedAt: r.source.observedAt, sourceReference: r.source.reference,
      freshness: "historical_claim", signedChallengeExpiresAt: null }); } catch {}
  }
  for (const item of input.walletControlEvents ?? []) {
    const r = item?.record as Record<string, any> | null;
    if (r?.type !== "veyra.wallet_control_memory.v1" || r.chain !== "sui" || r.network !== "mainnet" ||
        r.verification !== "valid_signature_for_purpose_bound_challenge" ||
        r.provenance !== "locally_reverified_portable_signature" ||
        !past(r.signedChallengeIssuedAt) ||
        typeof r.signedChallengeExpiresAt !== "string" || !Number.isFinite(Date.parse(r.signedChallengeExpiresAt)) ||
        Date.parse(r.signedChallengeExpiresAt) <= Date.parse(r.signedChallengeIssuedAt)) continue;
    try { add(item, { kind: "wallet_control", address: normalizeSuiAddress(r.address), counterpartyId: null,
      provenance: "record_claims_locally_reverified_signature", recipientBaseline: false,
      observedAt: r.signedChallengeIssuedAt, sourceReference: "Stored signature-verification claim; raw signature not retrieved or reverified",
      freshness: Date.parse(r.signedChallengeExpiresAt) <= now ? "expired_claim" : "unexpired_claim",
      signedChallengeExpiresAt: r.signedChallengeExpiresAt }); } catch {}
  }
  const observedAddresses = [...new Set(entries.filter(e => e.recipientBaseline).map(e => e.address))];
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
