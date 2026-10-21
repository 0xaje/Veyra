const DEFAULT_AGGREGATOR = "https://aggregator.walrus-mainnet.walrus.space";
export async function readWalrusBlob(blobId: string, aggregator = DEFAULT_AGGREGATOR): Promise<Uint8Array> {
  if (!/^[A-Za-z0-9_-]+$/.test(blobId)) throw new Error("Invalid Walrus blob ID");
  const response = await fetch(`${aggregator.replace(/\/$/, "")}/v1/blobs/${blobId}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Walrus read failed: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
// This is a real public read adapter, NOT a Walrus Memory integration.
// Mainnet memory write and retrieval must be implemented against verified official APIs.
