// Verify a portable, purpose-bound Sui wallet-control proof without contacting a wallet
// or writing a Walrus memory. A screenshot or receipt JSON alone is NOT proof.
import { normalizeSuiAddress } from "./recipient-check.ts";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";

export type PortableWalletProof = {
  address: string;
  message: string;
  signature: string;
  receipt: {
    type: "veyra.wallet_control_observation.v1";
    address: string;
    verifiedAt: string;
    receiptId: string;
    storageStatus: "prepared_not_stored";
    paymentAuthorized: false;
    identityVerified: false;
    recipientSafe: false;
    verificationMethod: "sui:signPersonalMessage";
  };
};

export async function verifyPortableWalletProof(input: PortableWalletProof, now = Date.now()) {
  if (!input || typeof input.message !== "string" || input.message.length > 2048 ||
      typeof input.signature !== "string" || !input.signature.length || input.signature.length > 2048 ||
      !input.receipt || input.receipt.type !== "veyra.wallet_control_observation.v1" ||
      input.receipt.storageStatus !== "prepared_not_stored" ||
      input.receipt.paymentAuthorized !== false || input.receipt.identityVerified !== false ||
      input.receipt.recipientSafe !== false || input.receipt.verificationMethod !== "sui:signPersonalMessage")
    throw new Error("Invalid wallet proof package");
  const address = normalizeSuiAddress(input.address);
  if (normalizeSuiAddress(input.receipt.address) !== address) throw new Error("Receipt address mismatch");
  const parts = input.message.split("\n");
  if (parts.length !== 7 ||
      parts[0] !== "Veyra wallet-control verification" ||
      parts[1] !== "Network: Sui Mainnet" ||
      parts[2] !== "Purpose: prove control of the specified address only; NOT a payment authorization." ||
      parts[3] !== "Address: " + address ||
      !/^Nonce: [0-9a-f]{48}$/.test(parts[4]) ||
      !parts[5].startsWith("Issued at: ") || !parts[6].startsWith("Expires at: "))
    throw new Error("Unexpected challenge format or purpose");
  const issued = Date.parse(parts[5].slice(11));
  const expires = Date.parse(parts[6].slice(12));
  const verified = Date.parse(input.receipt.verifiedAt);
  // The personal-message signature authenticates issuedAt/expiresAt, NOT the unsigned receipt verifiedAt.
  // Require receipt time within the signed challenge window; do not describe it as signed proof of time.
  if (![issued, expires, verified].every(Number.isFinite) ||
      expires - issued !== 300000 || verified < issued || verified >= expires ||
      verified > now || now - verified > 24 * 60 * 60 * 1000)
    throw new Error("Invalid or stale challenge chronology");
  const signer = await verifyPersonalMessageSignature(new TextEncoder().encode(input.message), input.signature, { address });
  if (!signer) throw new Error("Signature invalid");
  // A valid signed challenge proves key control, but not the claimed server verification instant.
  // Bind a conservative, authenticated observation window to the signed message.
  return { status: "portable_proof_verified" as const, address,
    claimedVerifiedAt: input.receipt.verifiedAt, signedChallengeIssuedAt: new Date(issued).toISOString(),
    signedChallengeExpiresAt: new Date(expires).toISOString(), receiptId: input.receipt.receiptId,
    paymentAuthorized: false as const, identityVerified: false as const,
    recipientSafe: false as const, walrusMemoryWritten: false as const };
}
