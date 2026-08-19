import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SESSION_COOKIE_OPTIONS } from "@/lib/session-cookies";
import { getRuntimeConfig } from "@/lib/runtime-config";

/**
 * Server Supabase client (anon key, RLS-enforced) for RSC / server components.
 * Reads the session from the request cookies; `setAll` is a no-op because
 * server components can't write cookies — token refresh happens in `proxy.ts`
 * and the auth callback route, which have writable cookie adapters.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig().public;
  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}
