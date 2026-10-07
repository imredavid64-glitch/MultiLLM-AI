import { NextResponse } from "next/server";

// Server-only (imports next/server) -- kept separate from lib/demoMode.ts's
// plain isDemoMode() check so that module stays safe to import from client
// components too (AuthProvider).
export function demoModeUnavailable(action: string) {
  return NextResponse.json(
    { error: `${action} isn't available in demo mode -- sign up for a free account to try it for real.` },
    { status: 403 }
  );
}
