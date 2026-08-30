"use client";

import { useLayoutEffect, useRef, type UIEvent } from "react";
import { Skeleton } from "mangue-ui";
import { AppContentHeader } from "@/components/app-content-header";
import {
  BOARD_COLUMN_CLASS,
  BOARD_SCROLLER_CLASS,
} from "@/lib/board-layout";
import {
  restoreBoardScroll,
  type BoardScrollPosition,
} from "@/lib/board-scroll";

const CARD_COUNTS = [3, 2, 2, 1];
const VIEW_WIDTHS = ["w-24", "w-20", "w-16", "w-20"];

/**
 * Full loading representation of the board.
 *
 * The toolbar, column chrome, cards, and create controls deliberately use the
 * same wrappers and spacing as their live counterparts. Keeping this as the
 * single skeleton for both route transitions and data loading avoids two
 * different layouts flashing before the board settles.
 */
export function BoardLoadingSkeleton({
  position,
  columns = 4,
  specialView = false,
  showCreateIssue = true,
}: {
  position?: BoardScrollPosition;
  columns?: number;
  /** Special views such as Cycle replace the standard right-side controls. */
  specialView?: boolean;
  /** Cycle boards do not offer issue creation from their columns. */
  showCreateIssue?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const localPosition = useRef(0);
  const scrollPosition = position ?? localPosition;

  useLayoutEffect(() => {
    const node = scrollerRef.current;
    if (node) restoreBoardScroll(node, scrollPosition);
  }, [scrollPosition]);

  const remember = (event: UIEvent<HTMLDivElement>) => {
    scrollPosition.current = event.currentTarget.scrollLeft;
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      aria-hidden
      data-board-loading-skeleton
    >
      <AppContentHeader
        data-board-skeleton-header
        contentClassName="gap-2 px-4 md:px-6"
      >
        <div className="flex shrink-0 items-center gap-1">
          {VIEW_WIDTHS.map((width, index) => (
            <Skeleton key={index} className={`h-7 ${width} rounded-full`} />
          ))}
          <Skeleton className="size-8 rounded-md" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {specialView ? (
            <>
              <Skeleton className="h-7 w-16 rounded-full" />
              <Skeleton className="h-8 w-44 rounded-md" />
              <Skeleton className="size-8 rounded-md" />
            </>
          ) : (
            Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="size-8 rounded-md" />
            ))
          )}
        </div>
      </AppContentHeader>

      <div className="min-h-0 flex-1 pt-3">
        <div
          ref={scrollerRef}
          onScroll={remember}
          className={`h-full ${BOARD_SCROLLER_CLASS}`}
        >
          {Array.from({ length: columns }).map((_, column) => (
            <div
              key={column}
              className={`flex flex-col ${BOARD_COLUMN_CLASS}`}
              data-board-skeleton-column
            >
              <div className="relative z-30 mb-2 flex items-center gap-2 bg-background px-1">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-4 w-24 rounded-sm" />
                <Skeleton className="h-3 w-4 rounded-sm" />
              </div>

              <div className="relative flex min-h-0 flex-1 flex-col rounded-xl">
                <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-hidden p-2">
                  {Array.from({
                    length: CARD_COUNTS[column % CARD_COUNTS.length],
                  }).map((__, card) => (
                    <BoardCardSkeleton
                      key={card}
                      detailed={(column + card) % 3 !== 2}
                    />
                  ))}

                  {showCreateIssue && <BoardCreateIssueSkeleton />}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BoardCardSkeleton({ detailed }: { detailed: boolean }) {
  return (
    <div
      className="flex shrink-0 flex-col gap-2 rounded-xl border border-border/60 bg-card p-3 dark:border-border"
      data-board-skeleton-card
    >
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-14 rounded-sm" />
        <Skeleton className="size-6 rounded-full" />
      </div>
      <Skeleton className={detailed ? "h-4 w-5/6" : "h-4 w-2/3"} />
      {detailed && <Skeleton className="h-4 w-1/2" />}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <Skeleton className="h-4 w-16 rounded-full" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="size-4 rounded-sm" />
        </div>
      </div>
    </div>
  );
}

function BoardCreateIssueSkeleton() {
  return (
    <div
      className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-6"
      data-board-skeleton-create-issue
    >
      <Skeleton className="size-4 rounded-sm" />
      <Skeleton className="h-4 w-24 rounded-sm" />
    </div>
  );
}
