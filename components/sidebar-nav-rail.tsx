"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "mangue-ui";
import type { LucideIcon } from "lucide-react";

export type SidebarNavRailItem = {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** Pastille d'attention sur la rangée — quelque chose y est incomplet. La
      chaîne est ce que dit le survol et ce que lit un lecteur d'écran : le point
      seul n'apprendrait rien à qui ne le voit pas. */
  indicator?: string;
};

/**
 * Le rail d'une sidebar secondaire dont les rangées choisissent un PANNEAU et
 * non un objet : les réglages (compte et projet) et l'admin.
 *
 * Ce sont des cartes à nous, et plus les `Tabs` de mangue-ui. La bibliothèque a
 * gagné en 0.6.0 un indicateur GLISSANT, un `<span>` peint dans la liste au
 * gabarit de l'onglet actif (`rounded-full`, `bg-background`, `shadow-sm`, et
 * une bordure en sombre). Il est invisible dans une barre d'onglets classique,
 * où il EST le fond de l'onglet actif — mais ici la sélection est déjà dessinée
 * par la pastille `layoutId` ci-dessous, et les deux se superposaient : une
 * capsule claire bordée, aux mauvais coins, sous la pastille. Neutraliser le
 * fond du déclencheur ne l'atteignait pas — il ne vit pas sur le déclencheur.
 *
 * Le rendu ne bouge pas d'un pixel : mêmes rangées, même pastille qui glisse,
 * mêmes libellés. Ce qui disparaît, c'est la sémantique d'onglets, dont ce rail
 * n'avait plus l'usage : la liste part par portail dans le châssis (donc hors du
 * DOM de son `<Tabs>`), et l'état vit dans `?tab=`. Un bouton par panneau, avec
 * `aria-current`, c'est la grammaire des autres barres secondaires — celle du
 * triage, des retours, des pull requests.
 */
export function SidebarNavRail({
  items,
  value,
  onValueChange,
  label,
}: {
  items: SidebarNavRailItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Le nom de la liste pour un lecteur d'écran (le titre de l'écran). */
  label: string;
}) {
  const reduceMotion = useReducedMotion();
  // `layoutId` est GLOBAL à framer-motion : deux rails montés en même temps
  // (une transition de route qui superpose deux écrans) se voleraient la
  // pastille. Un id par instance ferme la porte.
  const pillId = `sidebar-nav-pill-${useId()}`;

  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-1 px-2 pt-2 pb-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.value === value;
          return (
            <li key={item.value}>
              <button
                type="button"
                onClick={() => onValueChange(item.value)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "relative flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium outline-none transition-colors",
                  active
                    ? "text-foreground"
                    : "text-foreground/60 hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 dark:text-muted-foreground dark:hover:text-foreground",
                )}
              >
                {/* `layoutId` : une seule pastille montée à la fois, que
                    framer-motion fait GLISSER vers la nouvelle rangée au lieu de
                    la faire disparaître ici et réapparaître là. */}
                {active && (
                  <motion.span
                    layoutId={pillId}
                    aria-hidden
                    className="absolute inset-0 rounded-lg bg-muted"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 500, damping: 40 }
                    }
                  />
                )}
                {/* Positionné, donc peint AU-DESSUS de la pastille (même pile,
                    ordre du DOM) : sans ce span, l'absolu passerait par-dessus
                    le libellé, qui n'est pas positionné. */}
                <span className="relative flex min-w-0 flex-1 items-center gap-2">
                  {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
                  <span className="truncate">{item.label}</span>
                  {item.indicator && (
                    <span
                      className="ml-auto flex items-center"
                      title={item.indicator}
                    >
                      <span
                        className="size-1.5 rounded-full bg-amber-500"
                        aria-hidden
                      />
                      <span className="sr-only">{item.indicator}</span>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
