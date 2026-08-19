import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeConfig } from "@/lib/runtime-config";

// Singleton service-role client. Bypasses RLS — use ONLY on the server for
// privileged, cross-tenant work (email→account resolution, member/inviter
// hydration, invitation accept). Access checks are enforced manually in TS.
let _serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    const { supabaseUrl: url } = getRuntimeConfig().public;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error(
        "Missing MINDDY_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }
    _serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serviceClient;
}
