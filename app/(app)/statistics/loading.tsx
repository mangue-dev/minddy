import { Skeleton } from "mangue-ui";
import { AppContentHeader } from "@/components/app-content-header";
import { StatsSkeleton } from "@/components/stats/stats-skeleton";

export default function StatisticsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppContentHeader>
        <Skeleton className="h-5 w-56 max-w-full" />
      </AppContentHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <StatsSkeleton />
        </div>
      </div>
    </div>
  );
}
