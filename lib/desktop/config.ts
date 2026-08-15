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
 * L'origine de développement, ou `null` — `MINDDY_DESKTOP_ORIGIN`.
 *
 * Elle n'existe que pour développer contre `localhost` : en production la
 * coquille est signée et distribuée, les origines y sont en dur — une app de
 * bureau dont on peut détourner l'origine par une variable d'environnement est
 * une app dont on peut détourner l'écran de connexion.
 *
 * Quand elle est posée, elle gagne sur TOUT, canal compris : sur `localhost` il
 * n'y a ni stable ni preview, il n'y a qu'un serveur de dév.
 */
export const DESKTOP_ORIGIN_OVERRIDE: string | null =
  process.env.MINDDY_DESKTOP_ORIGIN?.trim() || null;

/**
 * L'origine du canal STABLE — celle que la fenêtre charge par défaut.
 *
 * Le canal, lui, se choisit à l'exécution : voir lib/desktop/channel.ts.
 */
export const DESKTOP_STABLE_ORIGIN: string = SITE_URL;

/**
 * L'origine du canal PREVIEW — le déploiement de branche `main` (MIN-352).
 *
 * En dur, comme sa voisine, et pour la même raison. Ce n'est pas un
 * environnement à part : c'est le MÊME projet Supabase (mêmes comptes, mêmes
 * données, mêmes clés publiques), servi par le dernier commit de `main` au lieu
 * du dernier promu en production. D'où le fait qu'on puisse y basculer sans rien
 * perdre — la seule chose qui ne suit pas, ce sont les cookies, qui sont par
 * origine.
 */
export const DESKTOP_PREVIEW_ORIGIN = "https://preview.minddy.app";

/**
 * L'origine par DÉFAUT de la fenêtre — le dév s'il est demandé, le stable sinon.
 *
 * ⚠ Ce n'est pas forcément celle que la fenêtre charge : le canal choisi par la
 * personne vit dans le main process (`desktop/src/channel-store.ts`) et se
 * résout par `desktopOriginForChannel`. Cette constante-ci reste le point de
 * départ, et ce que lisent les surfaces qui n'ont pas de canal (le lien du menu
 * d'aide, par exemple).
 */
export const DESKTOP_ORIGIN: string = DESKTOP_ORIGIN_OVERRIDE ?? DESKTOP_STABLE_ORIGIN;

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
 * Ce qu'il ne corrige PAS : le nom dans la barre de menus et l'icône du dock,
 * lus dans l'`Info.plist` du bundle. Ceux-là sont posés par
 * `desktop/electron-builder.yml` (MIN-292), donc par l'EMPAQUETAGE — d'où le
 * fait qu'en développement macOS affiche « Electron », et que c'est normal.
 */
export const DESKTOP_APP_NAME = "minddy";

/** L'identifiant signé du bundle macOS (`appId` dans electron-builder.yml). */
export const DESKTOP_BUNDLE_ID = "app.minddy.desktop";

/** Le schéma d'URL que macOS nous attribue (`minddy://auth?code=…`). */
export const DESKTOP_PROTOCOL = "minddy";

/** L'hôte du deep link d'authentification : `minddy://auth`. */
export const DESKTOP_AUTH_HOST = "auth";

/**
 * L'hôte du deep link de RETOUR : `minddy://open?next=…` (MIN-293).
 *
 * Il ramène la fenêtre sur une page de l'app depuis le navigateur système —
 * aujourd'hui la fin d'un paiement Stripe, demain tout aller-retour du même
 * genre. Voir lib/desktop/open-link.ts.
 */
export const DESKTOP_OPEN_HOST = "open";

/**
 * La page de rebond que le navigateur système traverse pour rouvrir l'app.
 *
 * Elle existe parce qu'un tiers ne peut PAS nous renvoyer sur `minddy://` :
 * Stripe (comme tout service sérieux) n'accepte qu'une URL http(s) en retour.
 * On lui donne donc celle-ci, et c'est elle qui appelle le schéma.
 */
export const DESKTOP_RETURN_PATH = "/desktop/return";

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
 * Le marqueur du TOUR, dans la même URL (MIN-345).
 *
 * macOS livre à l'app tout ce qui porte notre schéma, quelle qu'en soit
 * l'origine : un `minddy://auth?code=…` reçu du système connectait la fenêtre
 * sans que rien ne rattache ce lien à une demande de l'app. Le nonce part avec
 * la demande, traverse le provider et revient dans le deep link, où la fenêtre
 * le compare à celui qu'elle a gardé. Sans correspondance, le lien est ignoré.
 */
export const DESKTOP_TURN_PARAM = "turn";

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
