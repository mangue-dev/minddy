"use client";

import type { ReactNode } from "react";
import { cn } from "mangue-ui";
import {
  IsoIcon,
  type SceneIcon,
  type SceneTone,
} from "@/components/illustrations/iso-icon";

/**
 * Un état vide illustré : le bloc isométrique, une phrase, les gestes qui le
 * remplissent (MIN-173). L'écrire une fois est la seule façon d'être sûr que
 * tous tombent au même endroit, à la même hauteur, avec les mêmes écarts — les
 * avoir recopiés a suffi à les faire diverger.
 *
 * Deux tailles, et pas une de plus :
 *  - `page` (le défaut) — le board, les objectifs, le triage, la corbeille : la
 *    surface entière est vide, l'illustration a la place de respirer.
 *  - `compact` — une SECTION de réglages : le vide n'est qu'une ligne du
 *    formulaire, et un dessin à pleine taille y crierait plus fort que la
 *    section elle-même. Même bloc, moitié moins large, écarts resserrés.
 *
 * Les largeurs ont été DIVISÉES PAR DEUX en passant de l'icône couchée au bloc :
 * la première s'étalait dans un losange deux fois plus large que haut, le second
 * est presque carré. À largeur égale l'illustration aurait doublé de hauteur et
 * pris toute la place que l'état vide laissait au texte.
 *
 * À distinguer de `components/empty-state.tsx`, la petite boîte en pointillés
 * qui reste pour les listes internes (panneaux, sous-vues).
 */
export function EmptyScene({
  icon,
  title,
  size = "page",
  tone,
  children,
  className,
}: {
  /** L'icône de la page ou de la section — elle se pose sur le bloc. */
  icon: SceneIcon;
  title: string;
  size?: "page" | "compact";
  /** Teinte du dessin — `destructive` pour ce qui supprime (la corbeille). */
  tone?: SceneTone;
  /** Les actions, côte à côte. Aucune sur une surface qui se remplit seule. */
  children?: ReactNode;
  className?: string;
}) {
  const compact = size === "compact";
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "gap-3 px-4 py-6" : "gap-6 px-6 py-16",
        className
      )}
    >
      <IsoIcon icon={icon} tone={tone} className={compact ? "w-20" : "w-36"} />
      <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>
        {title}
      </p>
      {children ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-center",
            compact ? "gap-2" : "gap-3"
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
