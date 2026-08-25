import { Skeleton } from "mangue-ui";
import { StatsSkeleton } from "@/components/stats/stats-skeleton";

export default function StatisticsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-7">
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <StatsSkeleton />
    </div>
  );
}
