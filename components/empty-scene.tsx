"use client";

import type { ReactNode } from "react";
import { cn } from "mangue-ui";
import {
  IsoIconScene,
  type SceneIcon,
} from "@/components/illustrations/iso-icon";

/**
 * L'état vide d'une PAGE : la scène isométrique, une phrase, les gestes qui la
 * remplissent (MIN-173). Le board, les objectifs et le triage s'en servent —
 * l'écrire une fois est la seule façon d'être sûr que les trois tombent au même
 * endroit, à la même hauteur, avec les mêmes écarts. Les avoir recopiés a suffi
 * à les faire diverger.
 *
 * À distinguer de `components/empty-state.tsx`, la petite boîte en pointillés
 * qui dit qu'une LISTE est vide (une section de réglages, un panneau) : celle-ci
 * occupe la page entière et ouvre sur ce qu'on peut y faire.
 */
export function EmptyScene({
  icon,
  title,
  children,
  className,
}: {
  /** L'icône de l'onglet de la page — elle se couche sur le terrain. */
  icon: SceneIcon;
  title: string;
  /** Les actions, côte à côte. Aucune sur une page qui se remplit seule. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-6 px-6 py-16 text-center",
        className
      )}
    >
      <IsoIconScene icon={icon} className="w-72" />
      <p className="text-base font-medium">{title}</p>
      {children ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
