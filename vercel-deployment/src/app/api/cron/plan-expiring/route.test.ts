import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getProfilesWithPlanExpiringSoon: vi.fn(),
  maybeSendPlanExpiringEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/services", () => ({
  getProfilesWithPlanExpiringSoon: mocks.getProfilesWithPlanExpiringSoon,
}));
vi.mock("@/lib/lifecycleEmails", () => ({
  maybeSendPlanExpiringEmail: mocks.maybeSendPlanExpiringEmail,
}));

import { GET } from "./route";

function cronRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/cron/plan-expiring", { headers });
}

describe("GET /api/cron/plan-expiring", () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mocks.getProfilesWithPlanExpiringSoon.mockResolvedValue([]);
    mocks.maybeSendPlanExpiringEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it("rejects a request with no Authorization header", async () => {
    const res = await GET(cronRequest());
    expect(res.status).toBe(401);
  });

  it("rejects a request with the wrong secret", async () => {
    const res = await GET(cronRequest({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("rejects every request when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(cronRequest({ authorization: "Bearer anything" }));
    expect(res.status).toBe(401);
  });

  it("accepts a request with the correct secret and emails each expiring account", async () => {
    mocks.getProfilesWithPlanExpiringSoon.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);

    const res = await GET(cronRequest({ authorization: "Bearer test-secret" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ checked: 2, sent: 2 });
    expect(mocks.maybeSendPlanExpiringEmail).toHaveBeenCalledTimes(2);
  });
});
