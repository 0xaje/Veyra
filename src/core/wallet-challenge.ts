// Ephemeral, single-use Sui personal-message challenges. No transactions, payments or storage writes.
import { randomBytes } from "node:crypto";
import { normalizeSuiAddress } from "./recipient-check.ts";

const TTL_MS = 5 * 60_000;
const MAX_PENDING = 200;
const pending = new Map();

export function issueWalletChallenge(address, now = Date.now()) {
  const normalized = normalizeSuiAddress(address);
  for (const [key, item] of pending) if (item.expiresAt <= now) pending.delete(key);
  if (pending.size >= MAX_PENDING) throw new Error("Too many outstanding challenges");
  const nonce = randomBytes(24).toString("hex");
  const issuedAt = new Date(now).toISOString();
  const expiresAt = now + TTL_MS;
  const message = [
    "Veyra wallet-control verification",
    "Network: Sui Mainnet",
    "Purpose: prove control of the specified address only; NOT a payment authorization.",
    "Address: " + normalized,
    "Nonce: " + nonce,
    "Issued at: " + issuedAt,
    "Expires at: " + new Date(expiresAt).toISOString(),
  ].join("\n");
  pending.set(nonce, { address: normalized, message, expiresAt });
  return { nonce, address: normalized, message, issuedAt, expiresAt: new Date(expiresAt).toISOString(), paymentAuthorized: false };
}

export async function verifyWalletChallenge({ nonce, address, signature }, now = Date.now()) {
  if (typeof nonce !== "string" || !/^[0-9a-f]{48}$/.test(nonce) ||
      typeof signature !== "string" || signature.length > 2048 || !signature.length)
    return { status: "invalid_challenge", paymentAuthorized: false };
  const item = pending.get(nonce);
  // Consume before any async operation, including on invalid signatures, to prevent replay/races.
  if (!item) return { status: "invalid_or_consumed_challenge", paymentAuthorized: false };
  pending.delete(nonce);
  if (item.expiresAt <= now) return { status: "expired_challenge", paymentAuthorized: false };
  let normalized;
  try { normalized = normalizeSuiAddress(address); } catch { return { status: "invalid_address", paymentAuthorized: false }; }
  if (normalized !== item.address) return { status: "address_mismatch", paymentAuthorized: false };
  try {
    const { verifyPersonalMessageSignature } = await import("@mysten/sui/verify");
    const signer = await verifyPersonalMessageSignature(new TextEncoder().encode(item.message), signature, { address: normalized });
    if (!signer) return { status: "invalid_signature", paymentAuthorized: false };
    return { status: "wallet_control_verified", address: normalized, verifiedAt: new Date(now).toISOString(),
      proof: "valid_sui_personal_message_signature", independentlyVerified: true,
      identityVerified: false, recipientSafe: false, paymentAuthorized: false,
      limitation: "Proves signing-key control at verification time only; not identity, ownership of an exchange account or transfer safety." };
  } catch {
    return { status: "signature_verification_failed", paymentAuthorized: false };
  }
}
