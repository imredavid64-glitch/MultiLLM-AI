import { NextRequest, NextResponse } from "next/server";
import { getPlatformApiKeyById, deletePlatformApiKey } from "@/lib/supabase/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = req.nextUrl.searchParams.get("user_id") || "";
  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  const existing = await getPlatformApiKeyById(params.id);
  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ok = await deletePlatformApiKey(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
