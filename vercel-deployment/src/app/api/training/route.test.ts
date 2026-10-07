import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  createTrainingJob: vi.fn(),
  getTrainingJobs: vi.fn(),
  updateTrainingJob: vi.fn(),
  isDemoMode: vi.fn(),
}));

vi.mock("@/lib/supabase/serverAuth", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}));
vi.mock("@/lib/supabase/services", () => ({
  createTrainingJob: mocks.createTrainingJob,
  getTrainingJobs: mocks.getTrainingJobs,
  updateTrainingJob: mocks.updateTrainingJob,
}));
vi.mock("@/lib/demoMode", () => ({
  isDemoMode: mocks.isDemoMode,
}));

import { GET, POST } from "./route";

function getRequest() {
  return new NextRequest("http://localhost:3000/api/training");
}
function postRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/training", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/training", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDemoMode.mockReturnValue(false);
  });

  it("returns real model/corpus registry data with an empty jobs list in demo mode", async () => {
    mocks.isDemoMode.mockReturnValue(true);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.jobs).toEqual([]);
    expect(Array.isArray(json.models)).toBe(true);
    expect(json.models.length).toBeGreaterThan(0);
    expect(mocks.getAuthenticatedUserId).not.toHaveBeenCalled();
  });

  it("requires authentication outside demo mode", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });
});

describe("POST /api/training", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDemoMode.mockReturnValue(false);
  });

  it("refuses to start a training job in demo mode", async () => {
    mocks.isDemoMode.mockReturnValue(true);

    const res = await POST(postRequest({}));

    expect(res.status).toBe(403);
    expect(mocks.getAuthenticatedUserId).not.toHaveBeenCalled();
  });
});
