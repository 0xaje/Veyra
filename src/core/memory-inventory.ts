export type InventoryPage = {
  memories?: unknown[]; has_more?: boolean; next_cursor?: string | null;
  snapshot_version?: number; must_resync?: boolean;
};
type Metadata = {
  memory_id: string; blob_id: string; namespace_id: string; created_at: string | null;
  size: number | null; end_epoch: number | null; status: string;
};
/** Metadata inventory only: never a content verification or qualification count. */
export async function collectMemoryInventory(
  reader: { listMemories(options: { namespace: string; limit: number; cursor?: string }): Promise<InventoryPage> },
  namespace: string,
  options: { maxPages?: number; timeoutMs?: number } = {},
) {
  const maxPages = options.maxPages ?? 5, timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10 ||
      !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error("Invalid inventory bounds");
  const memories = new Map<string, Metadata>(), cursors = new Set<string>();
  let cursor: string | undefined, version: number | undefined;
  let dropped = 0;
  let completeness: "complete_snapshot" | "partial" | "unknown" = "partial";
  const started = Date.now();
  for (let pageNo = 0; pageNo < maxPages; pageNo++) {
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) break;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let page: InventoryPage;
    try {
      page = await Promise.race([
        reader.listMemories({ namespace, limit: 100, ...(cursor ? { cursor } : {}) }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Inventory deadline")), remaining); }),
      ]);
    } finally { clearTimeout(timer); }
    if (!page || !Array.isArray(page.memories)) throw new Error("Malformed inventory response");
    if (page.must_resync) throw new Error("Inventory snapshot requires resync");
    if (typeof page.snapshot_version !== "number") completeness = "unknown";
    else if (version === undefined) version = page.snapshot_version;
    else if (page.snapshot_version !== version) throw new Error("Inventory snapshot changed during pagination");
    for (const item of page.memories) {
      const m = item as Record<string, unknown> | null;
      if (m && typeof m.namespace_id === "string" && m.namespace_id !== namespace) continue;
      if (!m || m.namespace_id !== namespace ||
          typeof m.memory_id !== "string" || !m.memory_id || m.memory_id.length > 256 ||
          typeof m.blob_id !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(m.blob_id)) continue;
      const value: Metadata = {
        memory_id: m.memory_id, blob_id: m.blob_id, namespace_id: namespace,
        created_at: typeof m.created_at === "string" ? m.created_at : null,
        size: typeof m.size === "number" && Number.isFinite(m.size) && m.size >= 0 ? m.size : null,
        end_epoch: typeof m.end_epoch === "number" && Number.isSafeInteger(m.end_epoch) ? m.end_epoch : null,
        status: typeof m.status === "string" ? m.status.slice(0,64) : "unknown",
      };
      const prior = memories.get(value.memory_id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(value)) throw new Error("Conflicting inventory metadata");
      memories.set(value.memory_id, value);
    }
    if (page.has_more === false) {
      if (completeness !== "unknown") completeness = dropped ? "partial" : "complete_snapshot";
      break;
    }
    if (page.has_more !== true) { completeness = "unknown"; break; }
    if (typeof page.next_cursor !== "string" || !page.next_cursor || page.next_cursor.length > 4096 ||
        cursors.has(page.next_cursor)) throw new Error("Invalid inventory pagination cursor");
    cursors.add(page.next_cursor); cursor = page.next_cursor;
  }
  const records = [...memories.values()];
  return {
    count: records.length, uniqueBlobCount: new Set(records.map(m => m.blob_id)).size,
    memories: records, completeness, droppedCount: dropped, contentVerified: false, qualifyingMemoryCountVerified: false,
  };
}
