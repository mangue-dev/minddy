/**
 * La session qui SUIT le canal (MIN-353).
 *
 * ## Le problème, et pourquoi il n'a pas de solution côté web
 *
 * Les deux canaux servent le même projet Supabase — mêmes comptes, mêmes
 * données — mais pas la même ORIGINE : `www.minddy.app` et
 * `preview.minddy.app`. Or un cookie appartient à un hôte. Basculer le canal
 * arrivait donc sur l'écran de connexion, à chaque fois, dans les deux sens :
 * la session existe, elle est valide, elle est simplement rangée sous l'autre
 * porte.
 *
 * Élargir le cookie au domaine (`.minddy.app`) le réparerait pour tout le
 * monde — et le donnerait aussi à tout ce qui vit sous ce domaine, y compris ce
 * qu'on y mettra un jour sans y penser. Ce n'est pas un réglage à prendre pour
 * une commodité de l'app de bureau.
 *
 * **Le report se fait donc dans la coquille, et nulle part ailleurs.** Elle a
 * les deux jarres sous la main (une seule `session` Electron pour les deux
 * origines), elle sait exactement quand la bascule a lieu, et rien de ce qu'elle
 * fait ne change ce que le web sert à un navigateur.
 *
 * ## Le jeton de rafraîchissement, et pourquoi le sens compte
 *
 * GoTrue fait TOURNER le jeton de rafraîchissement à chaque usage : deux
 * origines qui détiennent le même finissent par en avoir une avec un jeton
 * périmé, et s'en servir vaut déconnexion. C'est pour ça que le report est
 * toujours dans le sens de la bascule, **depuis l'origine qu'on quitte** : celle
 * qu'on quitte est celle qui vient de s'en servir, donc celle qui a le jeton
 * frais. Celle qu'on rejoint est écrasée, pas fusionnée.
 *
 * Ce qui reste derrière est périmé, et n'a pas à être nettoyé : la prochaine
 * bascule dans l'autre sens l'écrasera à son tour, avec du frais. Aucun des deux
 * côtés ne se sert jamais d'un jeton qu'il n'a pas reçu au dernier passage.
 *
 * Module PUR : `desktop/src/main.ts` lit et écrit la jarre, ce fichier dit quoi.
 */

/** Un cookie tel qu'Electron le rend (`Electron.Cookie`), réduit à ce qu'on lit. */
export interface SourceCookie {
  name: string;
  value: string;
  /** Absent sur un cookie de session — il meurt alors avec l'app. */
  expirationDate?: number;
  sameSite?: string;
}

/** Ce qu'on passe à `cookies.set` (`Electron.CookiesSetDetails`). */
export interface CarriedCookie {
  url: string;
  name: string;
  value: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
  expirationDate?: number;
}

/** Les valeurs qu'Electron accepte ; tout le reste retombe sur celle de Supabase. */
const SAME_SITE = new Set(["unspecified", "no_restriction", "lax", "strict"]);

/**
 * Les cookies qui PORTENT la session, et eux seuls.
 *
 * `@supabase/ssr` écrit `sb-<ref>-auth-token`, et le découpe en
 * `sb-<ref>-auth-token.0`, `.1`… quand la charge dépasse la taille d'un cookie.
 * Les morceaux voyagent ensemble ou pas du tout : il en manque un et la session
 * ne se relit plus.
 *
 * **Ce qui est délibérément EXCLU** : `…-auth-token-code-verifier`, le
 * vérificateur PKCE d'un tour d'authentification en cours. Il appartient au tour
 * qui l'a tiré, sur l'origine qui l'a tiré ; le reporter ailleurs ne fait
 * qu'emporter un demi-échange que personne ne finira. Et tout le reste — langue,
 * consentement aux cookies, jetons de vue partagée — qui est un réglage de
 * l'origine, pas une identité.
 */
export function isSessionCookie(name: string): boolean {
  return /^sb-.+-auth-token(\.\d+)?$/.test(name);
}

/**
 * Ce qu'il faut écrire sur l'origine d'ARRIVÉE, à partir de ce qu'on a lu sur
 * celle de départ.
 *
 * Les options ne se recopient pas de la source, elles se DÉDUISENT de la cible :
 * `secure` suit son protocole (`https` en preview comme en production, `http` en
 * dév local), et `httpOnly` reste faux parce que le client Supabase du
 * navigateur lit ces cookies en JavaScript pour reconstruire la session — le
 * même choix que `lib/session-cookies.ts`, pour la même raison. Sans `domain` :
 * on écrit un cookie d'HÔTE, qui ne déborde pas sur les voisins.
 */
export function carrySessionCookies(
  cookies: readonly SourceCookie[],
  targetOrigin: string
): CarriedCookie[] {
  const secure = targetOrigin.startsWith("https://");
  return cookies.filter((cookie) => isSessionCookie(cookie.name)).map((cookie) => ({
    url: targetOrigin,
    name: cookie.name,
    value: cookie.value,
    path: "/",
    secure,
    httpOnly: false,
    sameSite:
      cookie.sameSite && SAME_SITE.has(cookie.sameSite)
        ? (cookie.sameSite as CarriedCookie["sameSite"])
        : "lax",
    ...(cookie.expirationDate === undefined
      ? {}
      : { expirationDate: cookie.expirationDate }),
  }));
}

/**
 * Les cookies de session à EFFACER sur l'origine d'arrivée avant d'écrire.
 *
 * Le cas qu'on répare : la cible portait une session découpée en trois morceaux,
 * celle qui arrive en fait deux. Écrire par-dessus laisse le `.2` de l'ancienne
 * traîner, et le client recolle trois morceaux dont le dernier n'appartient pas
 * à la même charge — une session illisible, donc une déconnexion, sur un chemin
 * dont tout l'objet était de l'éviter.
 *
 * On n'efface que ce qu'on ne va pas réécrire : le reste sera écrasé de toute
 * façon, et un cookie retiré puis reposé est un cookie qui n'existe pas pendant
 * l'intervalle.
 */
export function staleSessionCookies(
  targetCookies: readonly SourceCookie[],
  carried: readonly CarriedCookie[]
): string[] {
  const keep = new Set(carried.map((cookie) => cookie.name));
  return targetCookies
    .filter((cookie) => isSessionCookie(cookie.name) && !keep.has(cookie.name))
    .map((cookie) => cookie.name);
}
