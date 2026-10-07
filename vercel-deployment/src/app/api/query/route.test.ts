import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  authenticateApiKey: vi.fn(),
  getProfile: vi.fn(),
  decrementCredits: vi.fn(),
  getApiKeys: vi.fn(),
  getClientProject: vi.fn(),
  incrementApiKeyUsage: vi.fn(),
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  decryptApiKey: vi.fn(),
}));

vi.mock("@/lib/supabase/serverAuth", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}));
vi.mock("@/lib/apiKeyAuth", () => ({
  authenticateApiKey: mocks.authenticateApiKey,
}));
vi.mock("@/lib/supabase/services", () => ({
  getProfile: mocks.getProfile,
  decrementCredits: mocks.decrementCredits,
  getApiKeys: mocks.getApiKeys,
  getClientProject: mocks.getClientProject,
  incrementApiKeyUsage: mocks.incrementApiKeyUsage,
}));
vi.mock("@/lib/supabase/client", () => ({
  createServerSupabaseClient: () => ({
    from: () => ({ insert: async () => ({ data: null, error: null }) }),
  }),
}));
vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: mocks.getClientIp,
}));
vi.mock("@/lib/encryption", () => ({
  decryptApiKey: mocks.decryptApiKey,
}));

import { POST } from "./route";

const BASE_PROFILE = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  plan: "free" as const,
  credits: 100,
  plan_expires_at: null as string | null,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function postRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateApiKey.mockResolvedValue(null);
    mocks.getAuthenticatedUserId.mockResolvedValue("user-1");
    mocks.getProfile.mockResolvedValue({ ...BASE_PROFILE });
    mocks.getApiKeys.mockResolvedValue([]);
    mocks.getClientProject.mockResolvedValue(null);
    mocks.decrementCredits.mockResolvedValue(undefined);
    mocks.getClientIp.mockReturnValue("127.0.0.1");
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a request with no prompt", async () => {
    const res = await POST(postRequest({ prompt: "" }));
    expect(res.status).toBe(400);
  });

  it("falls back to a 503 ENSEMBLE_UNAVAILABLE response when the Python ensemble is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    );

    const res = await POST(postRequest({ prompt: "hello" }));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.code).toBe("ENSEMBLE_UNAVAILABLE");
  });

  it("rejects a deactivated account with 403, without ever calling the ensemble", async () => {
    mocks.getProfile.mockResolvedValue({ ...BASE_PROFILE, is_active: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(postRequest({ prompt: "hello" }));

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an expired plan with 402", async () => {
    mocks.getProfile.mockResolvedValue({
      ...BASE_PROFILE,
      plan_expires_at: "2020-01-01T00:00:00Z",
    });
    vi.stubGlobal("fetch", vi.fn());

    const res = await POST(postRequest({ prompt: "hello" }));
    const json = await res.json();

    expect(res.status).toBe(402);
    expect(json.error).toMatch(/expired/i);
  });

  it("rejects a request when credits are exhausted", async () => {
    mocks.getProfile.mockResolvedValue({ ...BASE_PROFILE, credits: 0 });
    vi.stubGlobal("fetch", vi.fn());

    const res = await POST(postRequest({ prompt: "hello" }));
    expect(res.status).toBe(402);
  });

  it("returns 429 with a Retry-After header when rate limited", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    vi.stubGlobal("fetch", vi.fn());

    const res = await POST(postRequest({ prompt: "hello" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
  });

  it("suggests signing up when the anonymous global daily cap is hit", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 3600, reason: "anon_daily_cap" });
    vi.stubGlobal("fetch", vi.fn());

    const res = await POST(postRequest({ prompt: "hello" }));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.code).toBe("anon_daily_cap");
    expect(json.error).toMatch(/sign up/i);
  });

  it("returns a real answer and decrements credits on a successful ensemble response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answer: "The answer.",
          candidates: [{ provider_name: "openai", model: "gpt-4o-mini" }],
          sources: [],
          metrics: { top_score: 0.9, latency_ms: 1200 },
          providers_used: ["openai"],
        }),
      }),
    );

    const res = await POST(postRequest({ prompt: "hello" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.answer).toBe("The answer.");
    expect(json._source).toBe("python-ensemble");
    expect(mocks.decrementCredits).toHaveBeenCalledWith("user-1", 1);
  });
});
