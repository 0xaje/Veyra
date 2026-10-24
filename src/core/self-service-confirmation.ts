import { createHash } from "node:crypto";
import { normalizeSuiAddress } from "./recipient-check.ts";

export type PublicationConsentInput = {
  address: string;
  counterpartyId: string;
  recordHash: string;
  scope: "public_walrus_recipient_confirmation";
  network: "sui-mainnet";
  expiresAt: string;
  nonce: string;
};

export type SignedPublicationConsent = {
  consent: PublicationConsentInput;
  signature: string;
  signerAddress: string;
  verifiedAt: string;
};

/**
 * Builds the canonical message string that the wallet must sign to authorize
 * public storage on Walrus Mainnet.
 */
export function buildPublicationConsentMessage(input: PublicationConsentInput): string {
  const normalized = normalizeSuiAddress(input.address);
  return [
    "Veyra public recipient-confirmation publication consent",
    "Network: Sui Mainnet",
    "Scope: public_walrus_recipient_confirmation",
    "Receiving address: " + normalized,
    "Counterparty identifier: " + input.counterpartyId.trim(),
    "Exact record SHA-256: " + input.recordHash.trim().toLowerCase(),
    "Consent nonce: " + input.nonce.trim(),
    "Expires at: " + input.expiresAt,
    "Notice: Walrus storage is permanent and public. This publishes an intended receiving destination, NOT an identity proof or payment authorization.",
  ].join("\n");
}

export type RecipientConfirmationCandidate = {
  type: "veyra.recipient_evidence.v1";
  chain: "sui";
  network: "mainnet";
  counterpartyId: string;
  address: string;
  addressKind: "wallet";
  recipientEligible: true;
  warning: string;
  eventType: "recipient_reconfirmed";
  source: {
    kind: "direct_owner_confirmation";
    reference: string;
    observedAt: string;
  };
  trust: "direct_owner_confirmed_with_signed_consent";
  publicationConsentHash: string;
  independentlyVerified: true;
  paymentAuthorized: false;
};

/**
 * Prepares the exact non-secret public candidate record and binds the record hash.
 * Crucially, raw cryptographic signatures and private secrets are excluded from public Walrus storage.
 */
export function prepareConsentedRecipientConfirmation(params: {
  address: string;
  counterpartyId: string;
  observedAt?: string;
  reference?: string;
}): { candidate: RecipientConfirmationCandidate; recordHash: string; candidateJson: string } {
  const address = normalizeSuiAddress(params.address);
  const counterpartyId = params.counterpartyId.trim();
  if (!counterpartyId || counterpartyId.length > 128) {
    throw new Error("Valid counterparty ID required");
  }
  const observedAt = params.observedAt || new Date().toISOString();
  const reference = params.reference || `Direct recipient confirmation signed and published via Veyra self-service`;

  // Base payload without publicationConsentHash to calculate deterministic record hash
  const basePayload = {
    type: "veyra.recipient_evidence.v1" as const,
    chain: "sui" as const,
    network: "mainnet" as const,
    counterpartyId,
    address,
    addressKind: "wallet" as const,
    recipientEligible: true as const,
    warning: "No ownership or payment safety is established. Verify independently before paying.",
    eventType: "recipient_reconfirmed" as const,
    source: {
      kind: "direct_owner_confirmation" as const,
      reference,
      observedAt,
    },
    trust: "direct_owner_confirmed_with_signed_consent" as const,
    independentlyVerified: true as const,
    paymentAuthorized: false as const,
  };

  const candidateJson = JSON.stringify(basePayload);
  const recordHash = createHash("sha256").update(candidateJson, "utf8").digest("hex");

  const candidate: RecipientConfirmationCandidate = {
    ...basePayload,
    publicationConsentHash: recordHash,
  };

  return {
    candidate,
    recordHash,
    candidateJson: JSON.stringify(candidate),
  };
}

/**
 * Server-side verification of the separate publication consent signature.
 */
export async function verifyPublicationConsent(
  consent: PublicationConsentInput,
  signature: string,
  now = Date.now()
): Promise<{ status: "valid" | "expired" | "invalid_signature" | "mismatch"; verifiedConsent?: SignedPublicationConsent; error?: string }> {
  const exp = Date.parse(consent.expiresAt);
  if (!Number.isFinite(exp) || exp <= now) {
    return { status: "expired", error: "Publication consent has expired" };
  }

  let normalizedAddress: string;
  try {
    normalizedAddress = normalizeSuiAddress(consent.address);
  } catch {
    return { status: "mismatch", error: "Invalid consent address" };
  }

  const message = buildPublicationConsentMessage(consent);

  try {
    const { verifyPersonalMessageSignature } = await import("@mysten/sui/verify");
    const signer = await verifyPersonalMessageSignature(
      new TextEncoder().encode(message),
      signature,
      { address: normalizedAddress }
    );
    if (!signer) {
      return { status: "invalid_signature", error: "Cryptographic signature does not match consent message" };
    }

    return {
      status: "valid",
      verifiedConsent: {
        consent,
        signature,
        signerAddress: normalizedAddress,
        verifiedAt: new Date(now).toISOString(),
      },
    };
  } catch (err) {
    return {
      status: "invalid_signature",
      error: err instanceof Error ? err.message : "Signature verification failed",
    };
  }
}
