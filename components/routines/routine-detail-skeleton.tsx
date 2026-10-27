import { AppContentHeader, APP_CONTENT_HEADER_LEADING_INSET } from "@/components/app-content-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The routine page while it loads: the same header and single column as
 * `RoutineDetail`, so the instruction, settings and runs land where their
 * placeholders stood. Kept out of the detail's chunk, which it stands in for.
 */
export function RoutineDetailSkeleton() {
  return (
    <div aria-busy="true" data-testid="routine-detail-skeleton" className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppContentHeader contentClassName="gap-2">
        <Skeleton className={`size-4 shrink-0 rounded-full ${APP_CONTENT_HEADER_LEADING_INSET}`} />
        <Skeleton className="h-4 w-48 rounded-md" />
        <span className="flex-1" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </AppContentHeader>
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-6 app-desktop:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {/* Instruction: its label, then a few lines of text. */}
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3.5 w-24 rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-11/12 rounded-md" />
            <Skeleton className="h-4 w-2/3 rounded-md" />
          </div>
          {/* Settings: the trigger and spending cap rows of their card. */}
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {[0, 1].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4 p-4">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-28 rounded-md" />
                  <Skeleton className="h-3 w-52 rounded-md" />
                </div>
                <Skeleton className="h-8 w-32 rounded-lg" />
              </div>
            ))}
          </div>
          {/* Runs: the section label and a couple of rows. */}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-16 rounded-md" />
            {[0, 1].map((row) => (
              <Skeleton key={row} className="h-10 rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
