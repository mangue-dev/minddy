import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
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

/** Resolve the authenticated user for a route handler, or a 401 response.
    Une instance Supabase injoignable (retries réseau épuisés, ~20 s) n'est PAS
    une session invalide : la déguiser en 401 fait croire à une déconnexion.
    On répond 503 avec un message explicite dans ce cas. */
export async function getAuthedUser(request: NextRequest): Promise<AuthedResult> {
  const supabase = createSupabaseFromRequest(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user) {
    if (
      error &&
      (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500)
    ) {
      const t = await getTranslations("ApiErrors");
      return {
        ok: false,
        response: NextResponse.json(
          { error: t("serviceUnavailable") },
          { status: 503 }
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, user, supabase };
}
