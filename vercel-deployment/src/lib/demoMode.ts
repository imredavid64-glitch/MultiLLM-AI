// Demo mode activates automatically whenever Supabase isn't configured --
// no separate flag to set. Safe to call from both the client (AuthProvider)
// and the server (/api/query): NEXT_PUBLIC_* vars are readable in both.
export function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
