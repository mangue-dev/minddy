import type { CookieOptions } from "@supabase/ssr";
import type { NextResponse } from "next/server";

/**
 * Les options des cookies de SESSION Supabase (MIN-351).
 *
 * `@supabase/ssr` écrit ses cookies avec ses propres défauts —
 * `{ path: "/", sameSite: "lax", httpOnly: false, maxAge: 400j }` — et il n'y a
 * PAS de `secure` dedans (voir `DEFAULT_COOKIE_OPTIONS` du paquet). Les cookies
 * qui portent la session étaient donc les seuls du dépôt à partir sans lui : les
 * trois écrits à la main (jeton d'attente d'OTP, déverrouillage de vue partagée,
 * identité du board public) le posent tous.
 *
 * Sans `Secure`, le navigateur consent à renvoyer le cookie sur `http://` — il
 * suffit d'amener la victime sur un lien en clair vers le domaine pour lire le
 * jeton d'accès en transit. HSTS couvre le cas en production, mais HSTS est une
 * politique du navigateur qui a besoin d'une première visite pour s'installer :
 * le drapeau, lui, est porté par le cookie lui-même.
 *
 * Conditionné à `NODE_ENV` — la même règle que les trois autres — parce que le
 * développement local est en HTTP nu : un `Secure` inconditionnel y ferait
 * simplement disparaître la session à chaque navigation. Next inline la
 * constante dans le bundle client, donc le client du navigateur la lit aussi.
 *
 * `httpOnly` reste FAUX, et ce n'est pas un oubli : le client du navigateur lit
 * ces cookies en JavaScript pour reconstruire la session. Les rendre `httpOnly`
 * déconnecterait l'app à chaque rechargement.
 */
export const SESSION_COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === "production",
} as const;

/**
 * Ce que `@supabase/ssr` donne à écrire, gardé de côté puis reporté sur la
 * réponse rendue (MIN-293).
 *
 * Lire une session peut la RENOUVELER : quand le jeton d'accès a expiré,
 * GoTrue rend un couple neuf et **fait tourner** le jeton de rafraîchissement au
 * passage. Un adaptateur qui jette ce qu'on lui donne à écrire transforme donc
 * une lecture en destruction de session — le serveur a dépensé le jeton, le
 * navigateur garde l'ancien, et le rafraîchissement suivant échoue en
 * `refresh_token_not_found`.
 *
 * Séparé de Supabase pour être tenu par un test : c'est le maillon qui manquait,
 * et un maillon qu'on ne peut pas exercer est un maillon qui recassera.
 */
export interface CookieSink {
  /** Ce que `@supabase/ssr` appelle pour écrire — son `cookies.setAll`. */
  collect: (cookies: { name: string; value: string; options: CookieOptions }[]) => void;
  /** À appeler sur la réponse rendue — y compris une redirection. */
  applyCookies: <T extends NextResponse>(response: T) => T;
}

export function createCookieSink(): CookieSink {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  return {
    collect(cookies) {
      pending.push(...cookies);
    },
    applyCookies(response) {
      for (const { name, value, options } of pending) {
        response.cookies.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
      }
      return response;
    },
  };
}
