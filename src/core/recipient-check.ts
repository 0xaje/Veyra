/** Deterministic, offline recipient comparison. No external risk claims. */
export type RecipientRecord = {
  chain: "sui";
  network: "mainnet";
  counterpartyId: string;
  address: string;
  confirmation: {
    method: string;
    confirmedAt: string;
    reference: string;
  };
};
export type RecipientCheck = {
  verdict: "match_confirmed_record" | "recipient_mismatch" | "no_trusted_record";
  proposedAddress: string;
  trustedAddress: string | null;
  counterpartyId: string;
  reasons: string[];
};
const SUI_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;
export function normalizeSuiAddress(address: string): string {
  const value = address.trim();
  if (!SUI_ADDRESS.test(value)) throw new Error("Invalid Sui address");
  return "0x" + value.slice(2).toLowerCase().padStart(64, "0");
}
export function checkRecipient(input: {
  proposedAddress: string;
  counterpartyId: string;
  trustedRecord?: RecipientRecord | null;
}): RecipientCheck {
  const proposedAddress = normalizeSuiAddress(input.proposedAddress);
  if (!input.counterpartyId.trim()) throw new Error("Counterparty ID required");
  const record = input.trustedRecord;
  if (!record) return {
    verdict: "no_trusted_record", proposedAddress, trustedAddress: null,
    counterpartyId: input.counterpartyId,
    reasons: ["No previously confirmed recipient address is available. Verify the destination through a trusted channel before payment."],
  };
  if (record.chain !== "sui" || record.network !== "mainnet" || record.counterpartyId !== input.counterpartyId) {
    throw new Error("Trusted record does not match the requested chain, network and counterparty");
  }
  if (!record.confirmation.method.trim() || !record.confirmation.reference.trim() || !Number.isFinite(Date.parse(record.confirmation.confirmedAt))) {
    throw new Error("Trusted record requires a documented confirmation");
  }
  const trustedAddress = normalizeSuiAddress(record.address);
  if (proposedAddress !== trustedAddress) return {
    verdict: "recipient_mismatch", proposedAddress, trustedAddress,
    counterpartyId: input.counterpartyId,
    reasons: ["The full destination address differs from the previously confirmed address for this counterparty. Do not rely on matching prefix or suffix characters; independently verify the change."],
  };
  return {
    verdict: "match_confirmed_record", proposedAddress, trustedAddress,
    counterpartyId: input.counterpartyId,
    reasons: ["The destination matches the previously confirmed recipient address exactly. This does not establish that the recipient is safe or that the confirmation remains current."],
  };
}
