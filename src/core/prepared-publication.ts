import { randomUUID } from "node:crypto";
import {
  buildPublicationConsentMessage, prepareConsentedRecipientConfirmation,
  type PublicationConsentInput,
} from "./self-service-confirmation.ts";

export type PublicationBinding = { origin: string; sessionHash: string };

type Prepared = ReturnType<typeof prepareConsentedRecipientConfirmation> & {
  consentPayload: PublicationConsentInput;
  consentMessage: string;
  binding?: PublicationBinding;
};

/**
 * Local-only staging. A restart invalidates outstanding preparations rather than
 * regenerating different bytes. This is NOT the durable public-write gate.
 */
export class PreparedPublications {
  private pending = new Map<string, Prepared>();
  private readonly capacity: number;
  constructor(capacity = 200) { this.capacity = capacity; }
  issue(address: string, counterpartyId: string, now = Date.now(), binding?: PublicationBinding): Prepared {
    for (const [nonce, value] of this.pending)
      if (Date.parse(value.consentPayload.expiresAt) <= now) this.pending.delete(nonce);
    if (this.pending.size >= this.capacity) throw new Error("Too many outstanding preparations");
    const prepared = prepareConsentedRecipientConfirmation({
      address, counterpartyId, observedAt: new Date(now).toISOString(),
    });
    const consentPayload: PublicationConsentInput = {
      ...(binding ? {origin:binding.origin} : {}),
      address: prepared.candidate.address, counterpartyId: prepared.candidate.counterpartyId,
      recordHash: prepared.recordHash, network: "sui-mainnet",
      scope: "public_walrus_recipient_confirmation",
      nonce: randomUUID().replace(/-/g, ""), expiresAt: new Date(now + 10 * 60_000).toISOString(),
    };
    if(binding && !/^[a-f0-9]{64}$/.test(binding.sessionHash)) throw new Error("Invalid publication session binding");
    const result = { ...prepared, ...(binding?{binding}:{}), consentPayload, consentMessage: buildPublicationConsentMessage(consentPayload) };
    this.pending.set(consentPayload.nonce, result);
    return structuredClone(result);
  }
  get(consent: PublicationConsentInput, now = Date.now()): Prepared | null {
    const value = this.pending.get(consent?.nonce);
    if (!value || Date.parse(value.consentPayload.expiresAt) <= now) return null;
    try {
      if (buildPublicationConsentMessage(consent) !== value.consentMessage) return null;
    } catch { return null; }
    return structuredClone(value);
  }
  consume(consent: PublicationConsentInput, now = Date.now()): Prepared | null {
    const value = this.get(consent, now);
    if (value) this.pending.delete(consent.nonce);
    return value;
  }
}
