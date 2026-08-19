import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SESSION_COOKIE_OPTIONS } from "@/lib/session-cookies";
import { browserRuntimeConfig } from "@/lib/runtime-config-provider";

let _supabase: SupabaseClient | null = null;

/**
 * Browser Supabase client (anon key, RLS-enforced). Lazy singleton so we never
 * spin up more than one client per tab. Used by client components and the auth
 * context.
 */
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const { supabaseUrl: url, supabaseAnonKey: key } = browserRuntimeConfig();
    // `cookieOptions`: THIS client writes session cookies to
    // time of connection, and the packet does not put `Secure` (MIN-351).
    _supabase = createBrowserClient(url, key, {
      cookieOptions: SESSION_COOKIE_OPTIONS,
    });
  }
  return _supabase;
}
