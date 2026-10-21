export type Evidence = { source: "tatum" | "walrus" | "user"; reference: string; observedAt: string; verified: boolean };
export type Assessment = { recipient: string; chain: string; network: string; verdict: "insufficient_evidence" | "review_required"; reasons: string[]; evidence: Evidence[] };
export function assess(input: { recipient: string; chain: string; network: string; evidence: Evidence[] }): Assessment {
  if (!input.recipient.trim() || !input.chain.trim() || !input.network.trim()) throw new Error("Recipient, chain and network are required");
  const hasVerifiedChainEvidence = input.evidence.some(e => e.source === "tatum" && e.verified);
  return { recipient: input.recipient, chain: input.chain, network: input.network,
    verdict: hasVerifiedChainEvidence ? "review_required" : "insufficient_evidence",
    reasons: hasVerifiedChainEvidence
      ? ["Onchain evidence is available, but transaction history alone cannot prove recipient safety."]
      : ["No independently verified onchain evidence is available. Do not treat this recipient as safe."],
    evidence: input.evidence };
}
