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

/**
 * Résout l'utilisateur authentifié d'un route handler, ou une réponse d'erreur.
 *
 * On vérifie le JWT via `getClaims()` plutôt que `getUser()`. Avec des clés de
 * signature ASYMÉTRIQUES (dashboard Supabase → Auth → JWT Signing Keys), la
 * vérification est LOCALE (WebCrypto + JWKS mis en cache) — aucun aller-retour
 * réseau vers GoTrue par requête, alors que chaque page fan-out en déclenche
 * plusieurs en parallèle. Avec l'ancien secret SYMÉTRIQUE (HS256), `getClaims()`
 * retombe exactement sur `getUser()` : même comportement qu'avant, donc bascule
 * zéro-régression qui s'active toute seule une fois les clés migrées.
 *
 * Une instance Supabase injoignable (retries réseau épuisés, ~20 s) n'est PAS
 * une session invalide : la déguiser en 401 fait croire à une déconnexion.
 * On répond 503 avec un message explicite dans ce cas.
 */
export async function getAuthedUser(request: NextRequest): Promise<AuthedResult> {
  const supabase = createSupabaseFromRequest(request);
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) {
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
  // Les claims du JWT vérifié portent tout ce que les handlers lisent (id via
  // `sub`, email, user_metadata, app_metadata). On reconstruit l'objet `User`
  // attendu par les appelants à partir de ces claims — pas d'appel réseau
  // supplémentaire pour aller chercher le compte complet.
  const user = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    phone: typeof claims.phone === "string" ? claims.phone : undefined,
    role: typeof claims.role === "string" ? claims.role : undefined,
    aud: claims.aud,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
    created_at: "",
  } as unknown as User;
  return { ok: true, user, supabase };
}
