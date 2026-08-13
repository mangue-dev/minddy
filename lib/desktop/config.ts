/**
 * Les constantes que l'app de bureau et le web partagent (MIN-291).
 *
 * Module PUR, sans `electron` et sans React : il est lu par le main process
 * (bundlé par scripts/build-desktop.mjs), par le preload, par le renderer, et
 * par la route de callback côté serveur. C'est exactement pour ça qu'il vit dans
 * `lib/` et non dans `desktop/src/` — voir desktop/README.md.
 */

import { SITE_URL } from "@/lib/site";

/**
 * L'origine que la fenêtre charge, et la SEULE dans laquelle elle navigue.
 *
 * `MINDDY_DESKTOP_ORIGIN` n'existe que pour développer contre `localhost` : en
 * production la coquille est signée et distribuée, l'origine y est en dur — une
 * app de bureau dont on peut détourner l'origine par une variable
 * d'environnement est une app dont on peut détourner l'écran de connexion.
 */
export const DESKTOP_ORIGIN: string =
  process.env.MINDDY_DESKTOP_ORIGIN?.trim() || SITE_URL;

/** Le schéma d'URL que macOS nous attribue (`minddy://auth?code=…`). */
/**
 * L'écran par lequel la fenêtre entre — **jamais la racine**.
 *
 * `/` sert l'argumentaire, et l'argumentaire s'adresse à quelqu'un qui ne s'est
 * pas encore décidé : dans une app installée, cette personne n'existe pas.
 * `/home` tranche tout seul, sans un octet de logique de plus ici : le proxy y
 * renvoie vers `/login` quand la session manque, et rend l'app quand elle est
 * là. Viser `/login` directement ferait clignoter l'écran de connexion sous les
 * yeux de quelqu'un qui est déjà connecté.
 */
export const DESKTOP_ENTRY_PATH = "/home";

/**
 * Le nom de l'app, et il n'est pas décoratif : **c'est lui qui nomme le dossier
 * de données**. `app.getPath("userData")` en dérive, et c'est là que vivront la
 * session, les caches et — surtout — les worktrees de l'agent local (§4.3 du
 * cadrage : `~/Library/Application Support/minddy/…`).
 *
 * D'où le fait de le poser MAINTENANT, avant qu'il existe des installations :
 * le changer plus tard déplacerait le dossier de tout le monde, et il faudrait
 * écrire une migration pour un simple renommage.
 *
 * Ce qu'il ne corrige PAS, et qui vient avec l'empaquetage (MIN-292) : le nom
 * dans la barre de menus et l'icône du dock, lus dans l'`Info.plist` du bundle.
 * En développement, macOS affiche « Electron », et c'est normal.
 */
export const DESKTOP_APP_NAME = "minddy";

/** Le schéma d'URL que macOS nous attribue (`minddy://auth?code=…`). */
export const DESKTOP_PROTOCOL = "minddy";

/** L'hôte du seul deep link qu'on traite : `minddy://auth`. */
export const DESKTOP_AUTH_HOST = "auth";

/**
 * Le marqueur que le `redirectTo` d'une demande d'authentification porte quand
 * elle vient de l'app de bureau.
 *
 * Il est dans l'URL et non dans l'user agent, et ce n'est pas un raccourci : le
 * navigateur qui revient sur `/auth/callback` est le navigateur SYSTÈME, pas
 * notre fenêtre. Son user agent ne dit rien de nous, et ne le dira jamais.
 */
export const DESKTOP_CALLBACK_FLAG = "desktop";

/**
 * Le suffixe d'user agent de la fenêtre — `…Chrome/… minddy-desktop/1.0.0`.
 *
 * Il ne sert à AUCUNE décision de l'app (celles-là lisent la présence du pont,
 * cf. lib/desktop/bridge.ts) : il sert à ce que les logs serveur et l'analytics
 * puissent distinguer l'app du navigateur sans qu'on ait à leur envoyer autre
 * chose.
 */
export function desktopUserAgentSuffix(version: string): string {
  return `minddy-desktop/${version}`;
}

/**
 * Le suffixe posé sur un user agent — **une seule fois**.
 *
 * Mesuré dans une vraie fenêtre : l'user agent par défaut d'Electron porte DÉJÀ
 * `<nom de l'app>/<version>`, au milieu de la chaîne, juste avant `Chrome/…`.
 * Comme l'app s'appelle `minddy-desktop`, ajouter naïvement le suffixe le fait
 * apparaître deux fois — une fois au milieu, une fois à la fin. Ce n'est pas
 * grave, c'est juste faux, et ça se voit dans chaque ligne de log.
 */
export function withDesktopUserAgent(userAgent: string, version: string): string {
  const suffix = desktopUserAgentSuffix(version);
  return userAgent.includes(suffix) ? userAgent : `${userAgent} ${suffix}`;
}
