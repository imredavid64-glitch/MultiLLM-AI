import { NextRequest, NextResponse } from "next/server";
import {
  createClientProject,
  getClientProjects,
  countActiveClientProjects,
  getProfile,
  CLIENT_PROJECT_LIMITS,
} from "@/lib/supabase/services";
import { getAuthenticatedUserId } from "@/lib/supabase/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [projects, profile] = await Promise.all([getClientProjects(userId), getProfile(userId)]);
  const plan = (profile?.plan as "free" | "pro" | "enterprise") || "free";
  const limit = CLIENT_PROJECT_LIMITS[plan];

  return NextResponse.json({
    projects,
    limit: Number.isFinite(limit) ? limit : null,
    plan,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const profile = await getProfile(userId);
  const plan = (profile?.plan as "free" | "pro" | "enterprise") || "free";
  const limit = CLIENT_PROJECT_LIMITS[plan];

  const currentCount = await countActiveClientProjects(userId);
  if (currentCount >= limit) {
    return NextResponse.json(
      {
        error: `Your ${plan} plan allows up to ${Number.isFinite(limit) ? limit : "unlimited"} client projects. Upgrade to add more.`,
        code: "PROJECT_LIMIT_REACHED",
      },
      { status: 402 }
    );
  }

  const project = await createClientProject(userId, name);
  if (!project) {
    return NextResponse.json({ error: "Failed to create client project" }, { status: 500 });
  }

  return NextResponse.json({ project });
}
