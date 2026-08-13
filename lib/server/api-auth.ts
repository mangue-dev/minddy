import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { MFA_REQUIRED_CODE, needsMfaChallenge } from "@/lib/mfa";

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

/**
 * Le même client, mais qui SAIT ÉCRIRE les cookies rafraîchis (MIN-293).
 *
 * ## Pourquoi il existe, et pourquoi il ne remplace pas le précédent
 *
 * Lire une session peut la RENOUVELER. Quand le jeton d'accès a expiré,
 * `getClaims()` / `getSession()` échangent le jeton de rafraîchissement contre
 * un couple neuf — et GoTrue **fait tourner** le jeton de rafraîchissement au
 * passage : l'ancien ne vaut plus rien quelques secondes plus tard.
 *
 * Un adaptateur qui jette ce qu'on lui donne à écrire transforme donc une
 * lecture en DESTRUCTION de session : le serveur a dépensé le jeton, le
 * navigateur garde l'ancien, et le prochain rafraîchissement — le sien comme le
 * nôtre — échoue en `refresh_token_not_found`. Dans les logs :
 *
 *     Error [AuthApiError]: Invalid Refresh Token: Refresh Token Not Found
 *
 * Pour les routes de l'app, ça n'arrive pas : le proxy passe AVANT, et lui écrit
 * les cookies (proxy.ts, branche « routes de l'app »). Le jeton est donc déjà
 * frais quand un handler le lit, et son `setAll` vide ne coûte rien. C'est ce
 * que dit `createSupabaseFromRequest`, et ça reste vrai.
 *
 * **Le trou est la route PUBLIQUE qui lit quand même une session.** Le proxy la
 * laisse passer sans toucher à l'auth — c'est tout l'intérêt d'être publique —
 * donc le handler est le premier et le seul à ouvrir les cookies, avec un jeton
 * qui peut très bien être expiré. `/feedback` est ce cas : il pré-identifie
 * l'utilisateur connecté, et il le faisait au prix de sa session.
 *
 * D'où ce constructeur-ci, à réserver exactement à ça : **une surface publique
 * qui lit l'utilisateur connecté**. Elle doit passer sa réponse par
 * `applyCookies` avant de la rendre, sans quoi on est revenu au point de départ.
 */
export interface CookieSink {
  /** Ce que `@supabase/ssr` appelle pour écrire — son `cookies.setAll`. */
  collect: (cookies: { name: string; value: string; options: CookieOptions }[]) => void;
  /** À appeler sur la réponse rendue — y compris une redirection. */
  applyCookies: <T extends NextResponse>(response: T) => T;
}

/**
 * Le report en lui-même, sans Supabase : ce qu'on a reçu à écrire ressort sur la
 * réponse. Séparé pour être tenu par un test — c'est le maillon qui manquait, et
 * un maillon qu'on ne peut pas exercer est un maillon qui recassera.
 */
export function createCookieSink(): CookieSink {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  return {
    collect(cookies) {
      pending.push(...cookies);
    },
    applyCookies(response) {
      for (const { name, value, options } of pending) {
        response.cookies.set(name, value, options);
      }
      return response;
    },
  };
}

export function createSupabaseWithCookieSink(
  request: NextRequest
): CookieSink & { supabase: SupabaseClient } {
  const sink = createCookieSink();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll: sink.collect,
      },
    }
  );
  return { ...sink, supabase };
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
 *
 * ## Second facteur (MIN-132)
 *
 * Un compte qui a enrôlé un facteur TOTP n'est servi qu'en `aal2`. Le refus est
 * GLOBAL et vit ici plutôt que route par route : une liste de routes sensibles
 * demanderait d'y penser à chaque ajout, et celle qu'on oublie de compléter est
 * une faille qu'aucun test ne signale. Comme le challenge est posé juste après le
 * mot de passe, une session `aal1` sur un compte protégé veut dire « connexion
 * abandonnée en cours de route » — la refuser ne casse aucun usage normal.
 *
 * `allowAal1` n'est là que pour la route de récupération (`/api/account/mfa/recover`),
 * le seul endroit qui doit répondre à quelqu'un qui n'a PLUS son téléphone.
 */
export async function getAuthedUser(
  request: NextRequest,
  options?: { allowAal1?: boolean }
): Promise<AuthedResult> {
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
  if (!options?.allowAal1 && needsMfaChallenge(claims)) {
    const t = await getTranslations("ApiErrors");
    return {
      ok: false,
      response: NextResponse.json(
        { error: t("mfaRequired"), code: MFA_REQUIRED_CODE },
        { status: 403 }
      ),
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
