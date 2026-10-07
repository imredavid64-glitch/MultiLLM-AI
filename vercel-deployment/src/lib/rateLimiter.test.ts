import { describe, it, expect, beforeEach, vi } from "vitest";

// No UPSTASH_REDIS_REST_URL/TOKEN in the test environment, so these exercise
// the in-memory backend -- same code path CI and local dev use without Redis
// configured. Each test dynamically re-imports the module after
// vi.resetModules() so its module-level Maps (and the daily cap counter)
// start empty every time, instead of leaking state between tests.

describe("checkRateLimit (anonymous)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("still enforces the existing 3/min per-IP limit", async () => {
    const { checkRateLimit } = await import("./rateLimiter");
    const ip = "198.51.100.10";

    expect((await checkRateLimit({ ip, tier: "free" })).allowed).toBe(true);
    expect((await checkRateLimit({ ip, tier: "free" })).allowed).toBe(true);
    expect((await checkRateLimit({ ip, tier: "free" })).allowed).toBe(true);

    const fourth = await checkRateLimit({ ip, tier: "free" });
    expect(fourth.allowed).toBe(false);
    expect(fourth.reason).toBeUndefined();
  });

  it("allows up to the global daily cap across distinct IPs, then blocks with anon_daily_cap", async () => {
    const { checkRateLimit } = await import("./rateLimiter");

    // Default cap is 200 (ANON_DAILY_QUERY_CAP unset in this test run). Use a
    // distinct IP per request so the per-IP 3/min limit never kicks in and
    // only the shared daily bucket is under test.
    for (let i = 0; i < 200; i++) {
      const res = await checkRateLimit({ ip: `203.0.113.${i}`, tier: "free" });
      expect(res.allowed).toBe(true);
    }

    const blocked = await checkRateLimit({ ip: "203.0.113.200", tier: "free" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("anon_daily_cap");
  });

  it("does not apply the anonymous daily cap to identified (logged-in) callers", async () => {
    const { checkRateLimit } = await import("./rateLimiter");

    // Exhaust the anonymous daily cap first.
    for (let i = 0; i < 200; i++) {
      await checkRateLimit({ ip: `203.0.113.${i}`, tier: "free" });
    }

    const res = await checkRateLimit({ ip: "203.0.113.201", identityKey: "user:abc", tier: "pro" });
    expect(res.allowed).toBe(true);
  });
});
