import { NextResponse } from "next/server";
import { getClientProject, deleteClientProject } from "@/lib/supabase/services";
import { getAuthenticatedUserId } from "@/lib/supabase/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await getClientProject(params.id);
  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ok = await deleteClientProject(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Failed to delete client project" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
