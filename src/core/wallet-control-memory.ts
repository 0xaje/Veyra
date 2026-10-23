// Consent-gated preparation of a public Walrus candidate from an independently checked
// portable Sui signature. No write occurs here; never persist the raw signature.
import { createHash } from "node:crypto";
import { verifyPortableWalletProof, type PortableWalletProof } from "./portable-wallet-proof.ts";

export async function prepareWalletControlMemory(
  proof: PortableWalletProof,
  options: { userApprovedPublicRecord: boolean },
  now = Date.now(),
) {
  if (options?.userApprovedPublicRecord !== true) throw new Error("Explicit approval for a public record is required");
  const verified = await verifyPortableWalletProof(proof, now);
  // Hash is only a correlation fingerprint, not a server-issued attestation or anti-replay registry.
  const challengeDigest = createHash("sha256").update(proof.message, "utf8").digest("hex");
  return {
    type: "veyra.wallet_control_memory.v1" as const,
    chain: "sui" as const,
    network: "mainnet" as const,
    address: verified.address,
    receiptId: verified.receiptId,
    signedChallengeIssuedAt: verified.signedChallengeIssuedAt,
    signedChallengeExpiresAt: verified.signedChallengeExpiresAt,
    claimedVerifiedAt: verified.claimedVerifiedAt,
    challengeSha256: challengeDigest,
    verificationMethod: "sui:signPersonalMessage" as const,
    verification: "valid_signature_for_purpose_bound_challenge" as const,
    provenance: "locally_reverified_portable_signature" as const,
    timestampLimitation: "Signed challenge time window is authenticated by signature; receipt verification timestamp is an unsigned claim.",
    identityVerified: false as const,
    recipientSafe: false as const,
    paymentAuthorized: false as const,
    independentlyVerifiedRecipientSafety: false as const,
    warning: "Key control at signing time only. Not identity, recipient trust, or authorization to send funds.",
  };
}
