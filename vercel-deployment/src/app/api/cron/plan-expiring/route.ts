import { NextRequest, NextResponse } from "next/server";
import { getProfilesWithPlanExpiringSoon } from "@/lib/supabase/services";
import { maybeSendPlanExpiringEmail } from "@/lib/lifecycleEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAYS_BEFORE_EXPIRY = 3;

// Daily Vercel cron (see vercel.json's "crons") -- not reachable without the
// shared secret, since this route has no user session of its own and would
// otherwise let anyone trigger a mass email send. Vercel's own cron
// invocations send this same header automatically when CRON_SECRET is set
// as a project env var; set it to a long random value, not anything guessable.
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization");
  if (!expected || provided !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await getProfilesWithPlanExpiringSoon(DAYS_BEFORE_EXPIRY);
  let sent = 0;
  for (const profile of profiles) {
    try {
      await maybeSendPlanExpiringEmail(profile);
      sent += 1;
    } catch (err) {
      console.warn(`Plan-expiring email failed for ${profile.id}:`, err);
    }
  }

  return NextResponse.json({ checked: profiles.length, sent });
}
