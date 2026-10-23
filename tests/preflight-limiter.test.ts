import test from "node:test";
import assert from "node:assert/strict";
import { createPreflightLimiter } from "../scripts/preflight-limiter.mjs";

test("per-peer public requests are capped and rejected without an admission token", () => {
  let time = 0;
  const limiter = createPreflightLimiter({ perClient: 2, windowMs: 1000, maxConcurrent: 2, now: () => time });
  const a = limiter.acquire("peer-a");
  assert.equal(a.allowed, true);
  a.release();
  const b = limiter.acquire("peer-a");
  assert.equal(b.allowed, true);
  b.release();
  assert.deepEqual(limiter.acquire("peer-a"), { allowed: false, reason: "rate_limit", retryAfter: 1 });
  const other = limiter.acquire("peer-b");
  assert.equal(other.allowed, true);
  other.release();
  time = 1000;
  const reset = limiter.acquire("peer-a");
  assert.equal(reset.allowed, true);
  reset.release();
});

test("concurrency rejection never grants a provider admission token", () => {
  const limiter = createPreflightLimiter({ perClient: 10, maxConcurrent: 1 });
  const first = limiter.acquire("a");
  assert.equal(first.allowed, true);
  assert.deepEqual(limiter.acquire("b"), { allowed: false, reason: "busy", retryAfter: 1 });
  assert.equal(limiter.snapshot().active, 1);
  first.release();
  first.release();
  assert.equal(limiter.snapshot().active, 0);
  const next = limiter.acquire("b");
  assert.equal(next.allowed, true);
  next.release();
});

test("client accounting is bounded", () => {
  const limiter = createPreflightLimiter({ maxClients: 2 });
  for (const peer of ["a", "b", "c"]) {
    const admitted = limiter.acquire(peer);
    assert.equal(admitted.allowed, true);
    if (!admitted.allowed) throw new Error("Expected test request to be admitted");
    admitted.release();
  }
  assert.equal(limiter.snapshot().trackedClients, 2);
});

test("invalid limiter configuration is rejected", () => {
  assert.throws(() => createPreflightLimiter({ perClient: 0 }), /Invalid limiter setting/);
});
