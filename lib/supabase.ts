import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SESSION_COOKIE_OPTIONS } from "@/lib/session-cookies";

let _supabase: SupabaseClient | null = null;

/**
 * Browser Supabase client (anon key, RLS-enforced). Lazy singleton so we never
 * spin up more than one client per tab. Used by client components and the auth
 * context.
 */
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
    }
    // `cookieOptions` : c'est CE client qui écrit les cookies de session au
    // moment de la connexion, et le paquet n'y met pas `Secure` (MIN-351).
    _supabase = createBrowserClient(url, key, {
      cookieOptions: SESSION_COOKIE_OPTIONS,
    });
  }
  return _supabase;
}
