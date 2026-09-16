import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// Check if we're in build time (no env vars)
const isBuildTime = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _supabase: ReturnType<typeof createClient<Database>> | null = null;
let _supabaseServer: SupabaseClient<any, "public", any> | null = null;

export const getSupabase = () => {
  if (isBuildTime) {
    // Return a mock client for build time
    return {
      from: () => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
        delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      }),
      storage: { from: () => ({ upload: () => Promise.resolve({ data: null, error: null }), download: () => Promise.resolve({ data: null, error: null }), list: () => Promise.resolve({ data: [], error: null }) }) },
      auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
    } as any;
  }
  
  if (!_supabase) {
    _supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
};

export const getSupabaseServer = () => {
  if (isBuildTime) {
    return getSupabase();
  }
  
  if (!_supabaseServer) {
    _supabaseServer = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return _supabaseServer;
};

// Export for backward compatibility
export const supabase = getSupabase();
export const createServerSupabaseClient = getSupabaseServer;