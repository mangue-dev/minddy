import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Anon Supabase client bound to the request cookies (RLS-enforced). Route
 * handlers act *as the user*, so RLS does the tenant isolation — no service
 * client needed for project CRUD. `setAll` is a no-op: handlers don't refresh
 * cookies (the middleware / auth callback own that).
 */
export function createSupabaseFromRequest(request: NextRequest): SupabaseClient {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    }
  );
}

export type AuthedResult =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; response: NextResponse };

/** Resolve the authenticated user for a route handler, or a 401 response. */
export async function getAuthedUser(request: NextRequest): Promise<AuthedResult> {
  const supabase = createSupabaseFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, user, supabase };
}
