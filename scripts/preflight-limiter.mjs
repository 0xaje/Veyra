// Process-local admission control for public provider-backed assessments.
// Uses the TCP peer address; never trusts user-supplied forwarding headers.
export function createPreflightLimiter({ perClient = 8, windowMs = 60_000, maxConcurrent = 2, maxClients = 2048, now = () => Date.now() } = {}) {
  for (const [name, value] of Object.entries({ perClient, windowMs, maxConcurrent, maxClients })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid limiter setting: ${name}`);
  }
  const clients = new Map();
  let active = 0;
  function acquire(peer) {
    const key = typeof peer === "string" && peer ? peer : "unknown";
    const time = now();
    // Bounded memory: discard expired counters, then evict oldest entry if needed.
    for (const [ip, state] of clients) if (time >= state.resetAt) clients.delete(ip);
    let state = clients.get(key);
    if (!state) {
      if (clients.size >= maxClients) clients.delete(clients.keys().next().value);
      state = { count: 0, resetAt: time + windowMs };
      clients.set(key, state);
    }
    if (state.count >= perClient) return { allowed: false, reason: "rate_limit", retryAfter: Math.max(1, Math.ceil((state.resetAt - time) / 1000)) };
    if (active >= maxConcurrent) return { allowed: false, reason: "busy", retryAfter: 1 };
    state.count += 1;
    active += 1;
    let released = false;
    return {
      allowed: true,
      release() { if (!released) { released = true; active -= 1; } },
    };
  }
  return { acquire, snapshot: () => ({ active, trackedClients: clients.size }) };
}
