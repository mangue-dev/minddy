import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "@/components/loading-skeletons";
import { cn } from "@/lib/utils";

const TITLE_WIDTHS = ["w-3/5", "w-4/5", "w-1/2", "w-2/3", "w-3/4"];
const SENTENCE_WIDTHS = ["w-2/5", "w-1/2", "w-1/3", "w-3/5", "w-2/5"];

/**
 * The notification list while it loads, on the geometry of a loaded one
 * (`components/inbox-content.tsx`): a group label, then rows with a 32px
 * avatar, the title line and the sentence below it. Kept out of the inbox's
 * chunk so the popover can show it while that chunk downloads.
 */
export function InboxRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <LoadingRegion>
      <Skeleton className="mx-4 mb-3 h-3 w-16" />
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className={cn("h-3.5", TITLE_WIDTHS[index % TITLE_WIDTHS.length])} />
              <Skeleton className={cn("h-3", SENTENCE_WIDTHS[index % SENTENCE_WIDTHS.length])} />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** The whole inbox while its chunk loads: the filter tabs, then the rows. */
export function InboxSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div aria-hidden className="flex min-h-12 shrink-0 items-center gap-4 px-3">
        {["w-12", "w-16", "w-10"].map((width) => (
          <Skeleton key={width} className={cn("h-3.5", width)} />
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden pt-3">
        <InboxRowsSkeleton />
      </div>
    </div>
  );
}
