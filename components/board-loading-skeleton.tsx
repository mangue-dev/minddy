"use client";

import { useLayoutEffect, useRef, type UIEvent } from "react";
import { Skeleton } from "mangue-ui";
import {
  BOARD_COLUMN_CLASS,
  BOARD_SCROLLER_CLASS,
} from "@/lib/board-layout";
import {
  restoreBoardScroll,
  type BoardScrollPosition,
} from "@/lib/board-scroll";

/** Loading columns that share their horizontal position with the real board. */
export function BoardLoadingSkeleton({
  position,
  columns = 4,
}: {
  position: BoardScrollPosition;
  columns?: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = scrollerRef.current;
    if (node) restoreBoardScroll(node, position);
  }, [position]);

  const remember = (event: UIEvent<HTMLDivElement>) => {
    position.current = event.currentTarget.scrollLeft;
  };

  return (
    <div className="min-h-0 flex-1 pt-4">
      <div
        ref={scrollerRef}
        onScroll={remember}
        className={`h-full ${BOARD_SCROLLER_CLASS}`}
      >
        {Array.from({ length: columns }).map((_, column) => (
          <div
            key={column}
            className={`flex flex-col gap-3 ${BOARD_COLUMN_CLASS}`}
          >
            <Skeleton className="h-5 w-28" />
            {Array.from({ length: Math.max(1, 4 - column) }).map((__, card) => (
              <Skeleton key={card} className="h-24 rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
