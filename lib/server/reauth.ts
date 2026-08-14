import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Ré-authentification avant un geste irréversible (MIN-345).
 *
 * La suppression de compte n'en demandait aucune : une session ouverte et une
 * adresse recopiée suffisaient. Or ce geste-là ne détruit pas qu'un compte — il
 * emporte en cascade tous les projets possédés, leurs tickets, leurs fichiers,
 * et l'accès de leurs membres. Un poste laissé déverrouillé cinq minutes, ou un
 * jeton volé, et l'équipe entière perd son travail.
 *
 * Ce qu'on exige dépend de ce que le compte PEUT produire :
 *
 * - **Compte avec mot de passe** : le mot de passe, revérifié auprès de GoTrue.
 *   C'est la preuve la plus directe, et la seule que rien d'autre ne détient.
 * - **Compte OAuth seul** (Google, GitHub) : il n'y a pas de mot de passe à
 *   redemander. On exige alors que l'authentification soit RÉCENTE — quinze
 *   minutes —, ce que le claim `amr` du JWT date pour nous. Se reconnecter chez
 *   le provider est le geste équivalent, et il est à une déconnexion de là.
 */

/** Au-delà, une authentification n'est plus une preuve de présence. */
export const REAUTH_MAX_AGE_SECONDS = 15 * 60;

/** Code rendu à l'appelant : « reconnecte-toi, puis recommence ». */
export const REAUTH_REQUIRED_CODE = "reauth_required";

/**
 * Le compte a-t-il une identité mot de passe ? `providers` liste tout ce qui
 * peut ouvrir une session dessus ; `provider` seul est la forme des comptes qui
 * n'en ont qu'une.
 */
export function hasPasswordIdentity(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== "object") return false;
  const meta = appMetadata as { provider?: unknown; providers?: unknown };
  if (Array.isArray(meta.providers)) return meta.providers.includes("email");
  return meta.provider === "email";
}

/**
 * Quand cette session s'est-elle authentifiée pour la dernière fois ?
 *
 * `amr` (« authentication methods references ») porte un horodatage par méthode
 * présentée — mot de passe, OAuth, TOTP. On garde le plus récent : c'est le
 * dernier moment où quelqu'un a prouvé quelque chose.
 *
 * **Le repli sur `iat` vaut moins, et c'est délibéré.** Un jeton se rafraîchit
 * tout seul toutes les heures, donc son `iat` ne date pas une authentification.
 * Mais un jeton sans `amr` — ce qu'aucune version de GoTrue en service ne
 * produit — laisserait sinon un compte OAuth définitivement incapable de se
 * supprimer, et enfermer quelqu'un dehors est le pire des deux défauts.
 */
export function lastAuthenticationAt(
  claims: { amr?: unknown; iat?: unknown } | null | undefined
): number | null {
  if (!claims) return null;
  if (Array.isArray(claims.amr)) {
    const stamps = claims.amr
      .map((entry) =>
        entry && typeof entry === "object"
          ? (entry as { timestamp?: unknown }).timestamp
          : null
      )
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (stamps.length > 0) return Math.max(...stamps);
  }
  return typeof claims.iat === "number" && Number.isFinite(claims.iat) ? claims.iat : null;
}

export function isRecentlyAuthenticated(
  claims: { amr?: unknown; iat?: unknown } | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const at = lastAuthenticationAt(claims);
  if (at === null) return false;
  return nowSeconds - at <= REAUTH_MAX_AGE_SECONDS;
}

/**
 * Le mot de passe, revérifié auprès de GoTrue.
 *
 * Client JETABLE, sans persistance : cette connexion ne doit rien ouvrir, elle
 * ne sert qu'à répondre oui ou non. Un client à cookies écrirait une session
 * neuve sur la réponse — et ferait tourner le jeton de rafraîchissement de la
 * personne au passage.
 */
export async function verifyAccountPassword(
  email: string,
  password: string
): Promise<boolean> {
  if (!email || !password) return false;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return false;
  // La session obtenue n'a aucune raison de survivre à cette question.
  if (data.session) await supabase.auth.signOut({ scope: "local" });
  return Boolean(data.user);
}
