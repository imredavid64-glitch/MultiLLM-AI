import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const isConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Resolves the authenticated user's id from the Supabase session cookie set
 * by `createBrowserClient` in AuthProvider. Never trust a client-supplied
 * user_id for anything security-sensitive (credits, API keys, billing) --
 * always derive it from the verified session instead.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  if (!isConfigured) return null;

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Read-only usage in route handlers -- no session refresh needed here.
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
