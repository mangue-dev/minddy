"use client";

import { cn } from "mangue-ui";

/**
 * L'anneau d'avancement de l'app : rempli dans le sens des aiguilles depuis midi
 * — le `Pie` des indicateurs de ticket, mais en TRAIT, pour qu'il se lise comme
 * une jauge et non comme un statut.
 *
 * Né sur le cycle (MIN-32), il est depuis la forme unique de « ce qui est fait
 * sur ce qui reste » : le cycle, et l'objectif partout où son avancement se lit
 * (colonne, en-tête du détail, bandeau du board). Une barre horizontale demande
 * une largeur qu'une ligne de liste n'a pas ; l'anneau tient dans la place d'une
 * icône.
 */
export function ProgressRing({
  percent,
  colorClass,
  className,
}: {
  percent: number;
  /** Tailwind text-color of the progress arc. */
  colorClass: string;
  className?: string;
}) {
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn("size-[19px] shrink-0 -rotate-90", className)}
    >
      <circle cx="8" cy="8" r={r} stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.5" />
      <circle
        cx="8"
        cy="8"
        r={r}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${(Math.min(100, Math.max(0, percent)) / 100) * c} ${c}`}
        className={colorClass}
      />
    </svg>
  );
}
