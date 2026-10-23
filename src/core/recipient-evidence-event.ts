import { normalizeSuiAddress } from "./recipient-check.ts";

export type RecipientEvidenceEventInput = {
  counterpartyId: string;
  address: string;
  eventType: "source_observed" | "recipient_reconfirmed" | "mismatch_reviewed";
  source: {
    kind: "public_official_document" | "direct_owner_confirmation" | "local_assessment";
    reference: string;
    observedAt: string;
  };
  userApprovedStorage: boolean;
};

/**
 * Informational observation, NOT a recipient registration or authorization.
 * Never transform a public attribution into a user-confirmed ownership claim.
 * This prepares data only; it does not write or count a Walrus memory.
 */
export function prepareRecipientEvidenceEvent(input: RecipientEvidenceEventInput) {
  if (input.userApprovedStorage !== true) throw new Error("Explicit storage approval required");
  if (!input || typeof input.counterpartyId !== "string" ||
      !input.counterpartyId.trim() || input.counterpartyId.length > 128)
    throw new Error("Invalid counterparty identifier");
  if (!["source_observed", "recipient_reconfirmed", "mismatch_reviewed"].includes(input.eventType))
    throw new Error("Unsupported evidence event");
  if (!input.source || !["public_official_document", "direct_owner_confirmation", "local_assessment"].includes(input.source.kind))
    throw new Error("Unsupported evidence source");
  if (input.eventType === "recipient_reconfirmed" && input.source.kind !== "direct_owner_confirmation")
    throw new Error("Reconfirmation requires direct owner confirmation");
  if (input.eventType === "mismatch_reviewed" && input.source.kind !== "local_assessment")
    throw new Error("Mismatch review requires a real local assessment");
  if (typeof input.source.reference !== "string" || !input.source.reference.trim() ||
      input.source.reference.length > 512) throw new Error("Evidence source reference required");
  const timestamp = Date.parse(input.source.observedAt);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== input.source.observedAt ||
      timestamp > Date.now()) throw new Error("Invalid observation timestamp");
  return {
    type: "veyra.recipient_evidence.v1" as const,
    chain: "sui" as const,
    network: "mainnet" as const,
    counterpartyId: input.counterpartyId.trim(),
    address: normalizeSuiAddress(input.address),
    eventType: input.eventType,
    source: { ...input.source, reference: input.source.reference.trim() },
    trust: "informational_unverified" as const,
    independentlyVerified: false as const,
    paymentAuthorized: false as const,
  };
}
