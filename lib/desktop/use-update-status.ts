"use client";

import { useEffect, useState } from "react";

import { getDesktopBridge } from "@/lib/desktop/bridge";
import {
  IDLE_UPDATE_STATUS,
  type DesktopUpdateStatus,
} from "@/lib/desktop/update-status";

/**
 * Où en est la mise à jour de la coquille, dans un composant (MIN-353).
 *
 * **Rend `idle` partout ailleurs** : dans le navigateur il n'y a pas de pont, et
 * pendant le rendu serveur il n'y a pas de `window`. C'est ce qui permet à
 * l'appelant de ne rien tester d'autre que l'état — une mise à jour de la
 * coquille n'existe simplement pas sur le web.
 *
 * ⚠ **On se DÉSABONNE.** Le pont rend son désabonnement et il faut le rendre :
 * un `ipcRenderer.on` laissé derrière survit au démontage, et la barre latérale
 * se remonte à chaque bascule de mode. C'est le défaut de la PR 48, à
 * l'identique — un abonnement qu'on n'a pas relâché ne se voit ni au type-check
 * ni à l'écran, il s'accumule.
 */
export function useDesktopUpdateStatus(): DesktopUpdateStatus {
  const [status, setStatus] = useState<DesktopUpdateStatus>(IDLE_UPDATE_STATUS);

  useEffect(() => {
    // Le pont ne se lit qu'après le montage : le rendu serveur n'en a pas, et
    // partir d'une valeur différente ferait diverger la première hydratation.
    const bridge = getDesktopBridge();
    if (!bridge) return;
    // L'abonnement rejoue l'état courant tout seul (`minddy:update-status-ready`),
    // il n'y a donc rien à demander en plus au montage.
    return bridge.onUpdateStatus(setStatus);
  }, []);

  return status;
}
