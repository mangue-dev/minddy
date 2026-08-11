"use client";

// La PILULE : la petite étiquette « une chose, avec sa figure » de minddy.
//
// Elle est née dans le contexte de Numo (components/assistant/context-pill.tsx),
// et les ressources d'un ticket la portaient de leur côté, en copie approchée.
// Deux copies veut dire deux rendus, et c'est ce qui se voyait : rayons qui ne
// se répondent pas, croix qui pousse le libellé, figure grise là où l'autre est
// teintée. Le dessin vit donc ICI, une fois, et les deux surfaces l'habillent.
//
// Ce que le dessin porte, et qui n'est pas décoratif :
//
//  • RAYONS CONCENTRIQUES. Le carré d'icône est un ENFANT de la pilule : son
//    rayon vaut « rayon de la pilule − padding » (4px). En `rounded-md` (14px)
//    l'icône est à 10px ; en `rounded-full` elle est ronde elle aussi. Un carré
//    à rayon fixe dans une pilule ronde est exactement l'erreur que ça corrige.
//
//  • LA COMMANDE PAR-DESSUS. Retirer/ignorer se pose en surimpression sur la fin
//    du libellé, avec un dégradé vers la couleur de la pilule — elle ne prend
//    pas de place à côté. Lui réserver une gouttière laisserait un vide à droite
//    de CHAQUE pilule au repos, pour un bouton qu'on ne voit qu'au survol.

import type { ReactNode } from "react";
import { cn } from "mangue-ui";

export type PillRadius = "full" | "md";

/** Rayon intérieur = rayon de la pilule − son padding (4px). */
export const PILL_INNER_RADIUS: Record<PillRadius, string> = {
  full: "rounded-full",
  md: "rounded-[10px]",
};

/**
 * La figure de la pilule : un carré de 20px teinté, au rayon concentrique.
 * `tint` porte fond ET couleur d'icône (`bg-…/12 text-…`) — une teinte à 12 %,
 * parce que c'est un repère qu'on lit du coin de l'œil, pas une pastille.
 */
export function PillIcon({
  radius = "full",
  tint,
  className,
  children,
}: {
  radius?: PillRadius;
  tint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden",
        PILL_INNER_RADIUS[radius],
        tint ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

export interface PillAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Visible en permanence plutôt qu'au survol — pour une commande qui est le
      seul chemin de retour (une pilule éteinte, par exemple). */
  persistent?: boolean;
}

/**
 * L'enveloppe : bordure, fond, ombre, rayon, et la commande en surimpression.
 * Le CONTENU (figure, libellé, complément) est composé par l'appelant, qui est
 * seul à savoir s'il doit être un lien, un bouton ou du texte inerte.
 */
export function EntityPill({
  radius = "full",
  dimmed = false,
  ariaLabel,
  action,
  className,
  children,
}: {
  radius?: PillRadius;
  /** Pilule éteinte : atténuée, mais toujours là. */
  dimmed?: boolean;
  ariaLabel?: string;
  action?: PillAction;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-label={ariaLabel}
      data-disabled={dimmed || undefined}
      className={cn(
        "group/pill relative flex min-w-0 max-w-full items-center gap-1.5 border border-border bg-card py-1 pl-1 pr-2.5 text-xs shadow-sm transition-opacity",
        radius === "full" ? "rounded-full" : "rounded-md",
        dimmed && "opacity-60",
        className
      )}
    >
      {children}
      {action && (
        <span
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 flex items-center rounded-[inherit] bg-gradient-to-l from-card via-card to-transparent pl-4 pr-1 transition-opacity",
            // Au clavier, c'est le focus du bouton qui la révèle — sans quoi on
            // tabulerait sur un invisible.
            action.persistent
              ? "opacity-100"
              : "opacity-0 group-hover/pill:opacity-100 has-[:focus-visible]:opacity-100"
          )}
        >
          <button
            type="button"
            aria-label={action.label}
            title={action.label}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              action.onClick();
            }}
            className="pointer-events-auto flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none"
          >
            {action.icon}
          </button>
        </span>
      )}
    </span>
  );
}
