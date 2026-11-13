import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "@/components/loading-skeletons";
import { cn } from "@/lib/utils";

const NAME_WIDTHS = ["w-1/4", "w-1/3", "w-1/5", "w-2/5", "w-1/4"];
const TITLE_WIDTHS = ["w-3/5", "w-4/5", "w-1/2", "w-2/3", "w-3/4"];
const CONTEXT_WIDTHS = ["w-2/5", "w-1/2", "w-1/3", "w-3/5", "w-2/5"];

/**
 * The notification list while it loads, on the geometry of a loaded one
 * (`components/inbox-row.tsx`): rows with a 36px avatar, the actor's name and
 * time, the sentence, and the context below it. Kept out of the inbox's chunk
 * so the popover can show it while that chunk downloads.
 */
export function InboxRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <LoadingRegion>
      <div className="divide-y divide-border/60 py-1">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-start gap-3 px-4 py-3.5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className={cn("h-3.5", NAME_WIDTHS[index % NAME_WIDTHS.length])} />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className={cn("h-3.5", TITLE_WIDTHS[index % TITLE_WIDTHS.length])} />
              <Skeleton className={cn("h-3", CONTEXT_WIDTHS[index % CONTEXT_WIDTHS.length])} />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** The whole inbox while its chunk loads: the view picker and menu, then the rows. */
export function InboxSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div aria-hidden className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3 pb-1">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="size-8 rounded-full" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <InboxRowsSkeleton />
      </div>
    </div>
  );
}
