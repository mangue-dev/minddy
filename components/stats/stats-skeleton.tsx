"use client";

import { Skeleton } from "mangue-ui";

/** Squelette calqué sur la vraie mise en page (MIN-85) : le bandeau du présent,
 *  la carte d'activité, puis deux sections — pour que le chargement annonce la
 *  page qui arrive plutôt qu'une grille de carrés qui n'existe nulle part. */
export function StatsSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-[116px] rounded-xl" />

      <div className="mt-8">
        <Skeleton className="mb-3 h-3 w-24" />
        <Skeleton className="h-[188px] rounded-xl" />
      </div>

      <div className="mt-8">
        <Skeleton className="mb-1.5 h-3 w-24" />
        <Skeleton className="mb-3 h-4 w-64" />
        <Skeleton className="h-[208px] rounded-xl" />
      </div>

      <div className="mt-8">
        <Skeleton className="mb-1.5 h-3 w-32" />
        <Skeleton className="mb-3 h-4 w-72" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-[108px] rounded-xl" />
          <Skeleton className="h-[108px] rounded-xl" />
        </div>
      </div>
    </div>
  );
}
