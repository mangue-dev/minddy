import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseCookieOptions } from "@/lib/session-cookies";
import { browserRuntimeConfig } from "@/lib/runtime-config-provider";
import { backendFetchWithTimeout } from "./backend-availability";

let _supabase: SupabaseClient | null = null;

/**
 * Browser Supabase client (anon key, RLS-enforced). Lazy singleton so we never
 * spin up more than one client per tab. Used by client components and the auth
 * context.
 */
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const { supabaseUrl: url, supabaseAnonKey: key, supabaseProjectRef } = browserRuntimeConfig();
    // `cookieOptions`: THIS client writes session cookies at sign-in, and the
    // package does not set `Secure` (MIN-351). A declared project ref also
    // pins the cookie name across a custom API domain (MIN-960).
    _supabase = createBrowserClient(url, key, {
      global: { fetch: backendFetchWithTimeout },
      cookieOptions: supabaseCookieOptions(supabaseProjectRef),
    });
  }
  return _supabase;
}
