import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  getQueries: vi.fn(),
  getQueryStats: vi.fn(),
  isDemoMode: vi.fn(),
}));

vi.mock("@/lib/supabase/serverAuth", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}));
vi.mock("@/lib/supabase/services", () => ({
  getQueries: mocks.getQueries,
  getQueryStats: mocks.getQueryStats,
}));
vi.mock("@/lib/demoMode", () => ({
  isDemoMode: mocks.isDemoMode,
}));

import { GET } from "./route";

function getRequest() {
  return new NextRequest("http://localhost:3000/api/analytics");
}

describe("GET /api/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDemoMode.mockReturnValue(false);
  });

  it("returns a zeroed-out, valid shape in demo mode instead of 401ing", async () => {
    mocks.isDemoMode.mockReturnValue(true);

    const res = await GET(getRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.overview).toEqual([]);
    expect(json.hourlyData).toHaveLength(24);
    expect(json.totals).toEqual({ totalQueries: 0, avgAccuracy: 0, totalCarbonSaved: 0, avgLatencyMs: 0 });
    expect(mocks.getAuthenticatedUserId).not.toHaveBeenCalled();
  });

  it("requires authentication outside demo mode", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue(null);

    const res = await GET(getRequest());

    expect(res.status).toBe(401);
  });
});
