import type { ComponentProps } from "react";
import { Skeleton as BaseSkeleton, cn } from "mangue-ui";
import { AppContentHeader } from "@/components/app-content-header";
import { SecondarySidebar } from "@/components/secondary-sidebar";

function Skeleton({ className, ...props }: ComponentProps<typeof BaseSkeleton>) {
  return <BaseSkeleton {...props} className={cn("bg-foreground/10", className)} />;
}

/** Match the grouped sidebar rows, including their metadata and status badges. */
export function PrListSkeleton() {
  return (
    <div aria-hidden data-testid="pr-list-skeleton" className="flex flex-col gap-2 pt-2 pb-4">
      <div className="flex items-center gap-2 px-2 py-1">
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-4 w-28" />
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg py-2 pr-2 pl-8">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className={cn("h-4", i % 2 ? "w-4/5" : "w-full")} />
          <div className="flex items-center gap-1.5">
            <Skeleton className="size-3.5 rounded-full" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="ml-auto h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PrActivitySkeleton() {
  return (
    <div aria-hidden data-testid="pr-activity-skeleton" className="flex flex-col gap-3">
      {[4, 2].map((lines, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl bg-muted/40 p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: lines }, (_, line) => (
              <Skeleton key={line} className={cn("h-3", line === lines - 1 ? "w-2/3" : "w-full")} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PrCommitsSkeleton() {
  return (
    <div aria-hidden data-testid="pr-commits-skeleton" className="flex flex-col gap-3">
      <Skeleton className="h-3 w-32" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function PrFilesSkeleton() {
  return (
    <div aria-hidden data-testid="pr-files-skeleton" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="ml-auto h-8 w-20" />
      </div>
      <div className="overflow-hidden rounded-xl bg-muted/40">
        <Skeleton className="h-10 rounded-none" />
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-3 w-5 shrink-0" />
              <Skeleton className={cn("h-3", ["w-2/3", "w-1/2", "w-4/5"][i % 3])} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PrMetadataSkeleton() {
  return (
    <div aria-hidden data-testid="pr-metadata-skeleton" className="flex flex-col gap-3">
      <Skeleton className="h-7 w-4/5" />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-32" />
      </div>
    </div>
  );
}

export function PrStatusSkeleton() {
  return (
    <div aria-hidden data-testid="pr-status-skeleton" className="flex w-full flex-col">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex min-h-11 items-center justify-between gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-40 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function PrHeaderActionsSkeleton() {
  return (
    <div aria-hidden className="ml-auto flex gap-2">
      <Skeleton className="h-8 w-16 rounded-full" />
      <Skeleton className="h-8 w-28 rounded-full" />
    </div>
  );
}

/** Used while the detail bundle or its initial forge request is pending. */
export function PrDetailSkeleton() {
  return (
    <div aria-busy="true" data-testid="pr-detail-skeleton" className="flex h-full min-h-0 flex-1 flex-col">
      <AppContentHeader contentClassName="gap-2">
        <Skeleton aria-hidden className="size-4 rounded" />
        <Skeleton aria-hidden className="h-4 w-24" />
        <PrHeaderActionsSkeleton />
      </AppContentHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 py-6">
          <PrMetadataSkeleton />
          <PrStatusSkeleton />
          <div aria-hidden className="flex gap-5">
            {[20, 16, 12].map((width) => <Skeleton key={width} className="h-7" style={{ width: width * 4 }} />)}
          </div>
          <PrActivitySkeleton />
        </div>
      </div>
    </div>
  );
}

export function PullRequestsSkeleton() {
  return (
    <div aria-busy="true" className="flex h-full min-h-0">
      <SecondarySidebar actions={<Skeleton aria-hidden className="h-7 w-full" />}>
        <PrListSkeleton />
      </SecondarySidebar>
      <div className="hidden min-h-0 min-w-0 flex-1 md:flex">
        <PrDetailSkeleton />
      </div>
    </div>
  );
}
