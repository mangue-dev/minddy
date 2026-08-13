"use client";

import { useDesktopNotifications } from "@/lib/use-desktop-notifications";

/**
 * L'hôte des notifications natives de l'app de bureau (MIN-291). Aucun rendu :
 * ce composant n'existe que pour son effet, à côté de `<PushServiceWorker />`
 * dans les providers de l'app — les deux surfaces du même besoin, chacune sur
 * la plateforme où elle marche.
 */
export function DesktopNotifications() {
  useDesktopNotifications();
  return null;
}
