import { normalizeSuiAddress } from "./recipient-check.ts";
import { assess, type Evidence } from "./assessment.ts";
import { preflightRememberedRecipient, type RecalledRecipient, type RecipientAuthorization } from "./recipient-preflight.ts";

export type TatumTransactionObservation = {
  status: "observed";
  provider: "tatum";
  network: "sui-mainnet";
  transport: "grpc";
  method: "LedgerService/GetTransaction";
  evidence: {
    digest: string;
    sender: string | null;
    executionStatus: string;
    balanceChanges: { address: string | null; amount: string | null; coinType: string | null }[];
  };
  checkedAt: string;
};

export function preflightWithEvidence(input: {
  counterpartyId: string;
  proposedAddress: string;
  recalled: RecalledRecipient[];
  authorizations: RecipientAuthorization[];
  tatumObservation?: TatumTransactionObservation | null;
}) {
  const proposedAddress = normalizeSuiAddress(input.proposedAddress);
  const recipient = preflightRememberedRecipient({
    counterpartyId: input.counterpartyId,
    proposedAddress,
    recalled: input.recalled,
    authorizations: input.authorizations,
  });
  const observation = input.tatumObservation;
  const validTatum = !!observation &&
    observation.status === "observed" &&
    observation.provider === "tatum" &&
    observation.network === "sui-mainnet" &&
    observation.method === "LedgerService/GetTransaction" &&
    /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(observation.evidence?.digest ?? "") &&
    Number.isFinite(Date.parse(observation.checkedAt)) &&
    Date.parse(observation.checkedAt) <= Date.now();
  const evidence: Evidence[] = validTatum ? [{
    source: "tatum",
    reference: observation!.evidence.digest,
    observedAt: observation!.checkedAt,
    verified: false, // Provider response is not independently cryptographically verified.
  }] : [];
  const matchesProposed = (value: unknown) => {
    if (typeof value !== "string") return false;
    try { return normalizeSuiAddress(value) === proposedAddress; } catch { return false; }
  };
  const historicalAddressObserved = validTatum && (
    matchesProposed(observation?.evidence.sender) ||
    (observation?.evidence.balanceChanges ?? []).some(change =>
      matchesProposed(change.address))
  );
  const assessment = assess({
    recipient: proposedAddress, chain: "sui", network: "mainnet", evidence,
  });
  return {
    status: "read_only_preflight" as const,
    recipient,
    historicalAddressObserved: Boolean(historicalAddressObserved),
    historicalObservationType: historicalAddressObserved ? "transaction_participant_only" : "none",
    chainEvidence: assessment,
    action: "manual_review_required" as const,
    paymentAuthorized: false as const,
    reasons: [
      ...recipient.reasons,
      historicalAddressObserved
        ? "Address appeared in provider-observed transaction history; this does not prove ownership or authorization."
        : "No relevant historical address observation was established.",
      "This workflow cannot authorize a payment. Independently verify the recipient.",
    ],
  };
}
