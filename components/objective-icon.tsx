"use client";

// L'icône d'un objectif — la cible, à SA couleur.
//
// Un objectif porte une couleur (facultative, prise dans la palette des
// catégories). Partout où une icône désigne CET objectif-là, elle la porte : la
// pilule de contexte de Numo, la mention posée dans une description, la liste
// des suggestions du « @ ». Le repli d'un objectif sans couleur est le gris des
// puces du board, et pas une teinte inventée : un objectif sans couleur n'en a
// pas.
//
// Ce composant ne sert PAS là où la cible désigne la NOTION d'objectif —
// l'onglet de la nav, « nouvel objectif » dans la palette, l'état vide de la
// page. Il n'y a là aucun objectif dont suivre la couleur, et l'icône reste
// neutre : la teindre reviendrait à désigner un objectif qui n'existe pas.

import { Target } from "lucide-react";
import { cn } from "mangue-ui";

/** La couleur d'un objectif, repli compris — la même règle que les puces du
    board (components/issue-property-fields, Dot). */
export function objectiveColor(color: string | null | undefined): string {
  return color ?? "var(--muted-foreground)";
}

/** La cible, à la couleur de l'objectif. */
export function ObjectiveIcon({
  color,
  className,
}: {
  color?: string | null;
  className?: string;
}) {
  return (
    <Target className={className} style={{ color: objectiveColor(color) }} />
  );
}

/**
 * La cible dans sa pastille teintée : 12 % de la couleur en fond, la couleur
 * pleine pour le trait — exactement le dosage des pilules de contexte de Numo,
 * dont c'est la géométrie. `color-mix` plutôt qu'une classe Tailwind : la
 * couleur est un hexadécimal stocké en base, pas un jeton connu à la compilation.
 */
export function ObjectiveIconBadge({
  color,
  className,
  iconClassName,
}: {
  color?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  const tone = objectiveColor(color);
  return (
    <span
      className={cn("flex items-center justify-center", className)}
      style={{
        backgroundColor: `color-mix(in oklab, ${tone} 12%, transparent)`,
        color: tone,
      }}
    >
      <Target className={iconClassName} />
    </span>
  );
}
