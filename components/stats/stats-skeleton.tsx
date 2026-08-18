"use client";

import { Skeleton } from "mangue-ui";

/** Skeleton modeled on the real layout (MIN-85): the banner of the present,
 * the activity card, then two sections - so that the loading announces the
 * page which arrives rather than a grid of squares which does not exist anywhere. */
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
