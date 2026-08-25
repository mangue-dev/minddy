"use client";

import { Skeleton } from "mangue-ui";

/** Loading geometry for the annual hero, work landscape, and compact rhythm card. */
export function StatsSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-10 w-[34rem] max-w-full" />
      <Skeleton className="mt-3 h-4 w-48" />
      <Skeleton className="mt-5 h-[190px] rounded-2xl" />

      <div className="mt-8">
        <Skeleton className="mb-2 h-4 w-44" />
        <Skeleton className="mb-3 h-3 w-72 max-w-full" />
        <Skeleton className="h-[310px] rounded-2xl" />
      </div>

      <div className="mt-8">
        <Skeleton className="mb-3 h-4 w-28" />
        <Skeleton className="h-[220px] rounded-xl" />
      </div>
    </div>
  );
}
