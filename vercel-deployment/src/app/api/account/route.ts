import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/serverAuth";
import { createServerSupabaseClient } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deletes the authenticated user's own account. auth.admin.deleteUser removes
// the auth.users row; every other table (profiles, api_keys, queries,
// training_jobs, subscriptions, platform_api_keys, client_projects) cascades
// via its ON DELETE CASCADE foreign key to profiles(id) in schema.sql, so a
// single call here is enough -- no separate per-table cleanup needed.
export async function DELETE() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await (supabase as any).auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
