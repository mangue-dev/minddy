"use client";

import {
  useAnyModalOpen,
  useHoldWindowButtons,
} from "@/lib/use-window-buttons";

/**
 * Retire les boutons macOS tant qu'une boîte de dialogue est ouverte (MIN-291).
 *
 * Ils sont natifs : le système les dessine par-dessus la vue web, et **aucun
 * `z-index` ne les dépasse**. Un dialogue ou un wizard les gardait donc en
 * travers de son coin, par-dessus le voile et l'ombre — l'inverse exact de ce
 * qu'un modal raconte. On ne peut pas les faire passer derrière ; on peut les
 * retirer le temps qu'il est là, et c'est cohérent : pendant ce temps, la
 * fenêtre n'est de toute façon pas ce qu'on manipule.
 *
 * Aucun rendu, et rien du tout hors de l'app de bureau. Monté à côté des autres
 * effets de l'app dans app-providers.
 */
export function DesktopWindowButtons() {
  useHoldWindowButtons("modal", useAnyModalOpen());
  return null;
}
