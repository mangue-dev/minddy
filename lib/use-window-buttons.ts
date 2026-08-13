"use client";

import { useEffect, useState } from "react";

import { getDesktopBridge } from "./desktop/bridge";

/**
 * Les boutons macOS sont-ils à l'écran, et à quelle place la marque doit-elle
 * donc se ranger ? (MIN-291)
 *
 * **La question se pose au main process, elle ne se devine pas.** Deux choses
 * décident : la barre latérale, qui les héberge et n'a pas la place une fois
 * repliée — ça, la page le sait ; et le PLEIN ÉCRAN, où macOS les emmène en
 * haut de l'écran, sous sa propre garde — ça, elle ne peut pas le savoir. Une
 * mise en page branchée sur la demande plutôt que sur le résultat laisse donc
 * un trou de 78 px dès qu'on passe en plein écran. Vu à l'usage.
 *
 * `visible` : ce qu'ils font vraiment. `request` : ce que l'appelant souhaite,
 * à rappeler quand sa propre condition change. Hors app de bureau, `visible`
 * reste `false` et `request` ne fait rien — la marque est à gauche, comme sur
 * le web.
 */
export function useWindowButtons(wanted: boolean): boolean {
  const [visible, setVisible] = useState(false);

  // L'abonnement d'abord, la demande ensuite : l'état courant est rejoué à
  // l'abonnement, et une demande émise avant lui serait annoncée dans le vide.
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    return bridge.onWindowButtons(setVisible);
  }, []);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    bridge.setWindowButtonsVisible(wanted);
    // Au démontage on redemande les boutons : le mode zen retire la barre
    // latérale entièrement, et une fenêtre sans barre ni boutons n'a plus de
    // fermeture visible du tout.
    return () => bridge.setWindowButtonsVisible(true);
  }, [wanted]);

  return visible;
}
