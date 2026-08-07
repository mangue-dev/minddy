"use client";

/**
 * Refermer une notification poussée quand on arrive sur la page qu'elle désigne.
 *
 * Une notification système ne s'efface pas toute seule : une fois affichée, elle
 * reste dans le centre de notifications jusqu'à ce qu'on la balaye à la main —
 * y compris quand on a lu le commentaire qu'elle annonçait, dans l'app, dix
 * secondes plus tôt. Le clic sur la bannière, lui, la referme (`notificationclick`
 * dans public/sw.js) ; c'est le chemin d'à côté, celui qui passe par l'app, qui
 * laissait tout derrière lui.
 *
 * ## Ce que « la page concernée » veut dire
 *
 * La charge utile poussée porte le chemin de sa cible (`notificationTargetPath`),
 * et rien d'autre ne l'identifie. Le rapprochement se fait donc URL contre URL :
 * même chemin, et mêmes valeurs pour les paramètres qui DÉSIGNENT la cible
 * (`NOTIFICATION_TARGET_PARAMS`). Les autres paramètres sont ignorés dans les
 * deux sens — l'app en ajoute (un onglet, un filtre, une vue) sans que ça change
 * ce qu'on est en train de regarder.
 *
 * L'asymétrie est voulue : une notification de ticket (`?issue=…`) ne se referme
 * PAS parce qu'on est sur le board qui le contient, seulement quand le ticket
 * lui-même est ouvert.
 *
 * ## Où ça vit
 *
 * Ici et nulle part ailleurs. Le service worker ne décide de rien : il prévient
 * les onglets qu'il vient d'afficher quelque chose (`push-shown`), et c'est la
 * page — la seule à savoir ce qu'elle affiche — qui tranche. Il ne pourrait pas
 * faire autrement de toute façon : public/sw.js est servi tel quel, sans build,
 * donc sans import.
 */

import { NOTIFICATION_TARGET_PARAMS } from "@/lib/notification-target";

/** Base bidon : les deux URL sont des chemins relatifs, l'origine ne sert qu'à
 *  `new URL` et disparaît de la comparaison. */
const BASE = "http://minddy.invalid";

/** `/inbox/` et `/inbox` sont la même page. */
function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * L'écran actuellement affiché (`currentUrl`) est-il celui vers lequel mène une
 * notification (`targetUrl`) ? Les deux sont des chemins relatifs, éventuellement
 * avec une query.
 */
export function showsNotificationTarget(
  currentUrl: string,
  targetUrl: string
): boolean {
  let current: URL;
  let target: URL;
  try {
    current = new URL(currentUrl, BASE);
    target = new URL(targetUrl, BASE);
  } catch {
    return false;
  }

  if (normalizePath(current.pathname) !== normalizePath(target.pathname)) {
    return false;
  }

  for (const param of NOTIFICATION_TARGET_PARAMS) {
    const wanted = target.searchParams.get(param);
    if (wanted === null) continue;
    if (current.searchParams.get(param) !== wanted) return false;
  }
  return true;
}

/** Ce vers quoi mène une notification affichée : le service worker le range dans
 *  `data.url`, et se rabat sur le `tag` (qui est ce même chemin) par sécurité. */
function notificationUrl(notification: Notification): string | null {
  const fromData = (notification.data as { url?: unknown } | null)?.url;
  if (typeof fromData === "string" && fromData) return fromData;
  return notification.tag || null;
}

/**
 * Referme toutes les notifications affichées qui mènent à l'écran donné. Rend le
 * nombre de notifications refermées.
 *
 * Best-effort de bout en bout, et silencieux : sans permission il n'y a pas
 * d'enregistrement, sans enregistrement il n'y a rien à refermer, et
 * `getNotifications` manque encore sur certains Safari — aucun de ces cas n'est
 * une panne, et aucun n'a à remonter jusqu'à l'utilisateur.
 */
export async function closeNotificationsForView(currentUrl: string): Promise<number> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return 0;
  // Sans permission, il ne peut RIEN y avoir d'affiché : on sort avant le
  // moindre await. C'est le cas de l'immense majorité des visites, et ça
  // s'appelle à chaque navigation.
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return 0;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration || typeof registration.getNotifications !== "function") return 0;

    const notifications = await registration.getNotifications();
    let closed = 0;
    for (const notification of notifications) {
      const url = notificationUrl(notification);
      if (!url || !showsNotificationTarget(currentUrl, url)) continue;
      notification.close();
      closed++;
    }
    return closed;
  } catch {
    return 0;
  }
}
