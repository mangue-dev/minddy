/**
 * Ce que la fenêtre de l'app affiche, et ce qu'elle refuse (MIN-291, MIN-292).
 *
 * **La règle tient en une phrase : l'app de bureau ne montre que
 * l'authentification et l'app.** Tout le reste de ce que sert notre origine —
 * l'argumentaire, les tarifs, le serveur MCP, les comparatifs, les nouveautés,
 * les pages légales, la page de téléchargement, et les surfaces publiques à
 * jeton (board de feedback, page publiée, vue partagée) — s'ouvre dans le
 * navigateur système.
 *
 * Ce n'est pas une préférence d'ergonomie, c'est une question d'identité. Une
 * fenêtre installée qui affiche « Essayez minddy gratuitement », un bandeau de
 * cookies ou une grille de tarifs s'adresse à quelqu'un qui ne s'est pas encore
 * décidé — cette personne n'existe pas ici : elle a téléchargé, elle a passé le
 * premier lancement, elle veut son travail. Et un board de feedback public dans
 * l'app de bureau, c'est le site web dans une fenêtre.
 *
 * **Trois issues, pas deux**, et la nuance compte :
 *
 * - `allow` — l'app, l'authentification, les routes internes.
 * - `external` — la page part au navigateur. C'est le cas général.
 * - `home` — la LANDING, et elle seule. Elle n'est pas une destination qu'on
 *   demande : on y tombe, par un logo qui pointe vers `/`. Lancer un navigateur
 *   à chaque clic de logo serait un châtiment ; on ramène à l'entrée, qui mène à
 *   l'app ou à la connexion selon la session.
 *
 * **La liste se DÉRIVE de [public-routes.ts](../public-routes.ts)**, elle ne se
 * recopie pas : ajouter une page publique la met automatiquement hors de la
 * fenêtre, sans que personne ait à y penser.
 */

import { PUBLIC_ROUTE_PATHS } from "@/lib/public-routes";

/**
 * Ce qu'il faut faire d'une URL de NOTRE origine.
 *
 * L'origine, elle, est l'affaire de [nav-guard.ts](nav-guard.ts) : ce module-ci
 * ne se prononce que sur des chemins de chez nous.
 */
export type DesktopRouteDisposition = "allow" | "external" | "home";

/**
 * Les surfaces publiques à JETON. Elles ne sont pas dans `PUBLIC_ROUTES` — leur
 * URL n'est pas une page mais une autorisation — et elles se reconnaissent donc
 * à leur préfixe. Sans elles, il suffisait de coller le lien d'un board de
 * feedback pour ouvrir le site public DANS l'app.
 */
const TOKEN_PREFIXES = ["/f/", "/p/", "/share/"] as const;

/**
 * La landing, dans ses deux langues. Le seul chemin public qu'on ramène à
 * l'entrée au lieu de l'envoyer dehors — voir l'en-tête.
 */
const LANDING_PATHS: ReadonlySet<string> = new Set(["/", "/fr"]);

/** `/pricing/` et `/pricing` sont la même page ; `/` reste `/`. */
function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * Le chemin d'une URL ou d'un chemin — le main process voit passer des URLs, le
 * renderer des chemins. `null` quand ce n'en est ni l'un ni l'autre.
 */
function pathnameOf(pathOrUrl: string): string | null {
  if (pathOrUrl.startsWith("/")) return normalize(new URL(pathOrUrl, "http://x").pathname);
  try {
    return normalize(new URL(pathOrUrl).pathname);
  } catch {
    return null;
  }
}

/** Que faire de cette URL ? Le seul point de décision. */
export function routeDisposition(pathOrUrl: string): DesktopRouteDisposition {
  const pathname = pathnameOf(pathOrUrl);
  // Illisible : on ne bloque pas sur une chaîne qu'on n'a pas su lire — la garde
  // d'origine, elle, a déjà refusé tout ce qui n'est pas chez nous.
  if (pathname === null) return "allow";

  if (LANDING_PATHS.has(pathname)) return "home";
  if (PUBLIC_ROUTE_PATHS.has(pathname)) return "external";
  if (TOKEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "external";
  return "allow";
}

/** Cette URL doit-elle quitter la fenêtre, d'une façon ou d'une autre ? */
export function leavesTheWindow(pathOrUrl: string): boolean {
  return routeDisposition(pathOrUrl) !== "allow";
}
