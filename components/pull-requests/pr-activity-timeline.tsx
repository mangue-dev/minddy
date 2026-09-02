import { cn } from "mangue-ui";

/**
 * Shared structure for the pull request conversation timeline.
 *
 * The rail belongs to the whole feed so comments, reviews, and compact events
 * read as one sequence. Each item owns only its marker and content surface.
 */
export function PrActivityTimeline({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ul
      data-testid="pr-activity-timeline"
      className="relative flex flex-col gap-4 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-border"
    >
      {children}
    </ul>
  );
}

/** A marker on the shared rail and the content aligned with it. */
export function PrActivityItem({
  marker,
  children,
  className,
  contentClassName,
}: {
  marker: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <li
      data-testid="pr-activity-item"
      className={cn(
        "relative grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-start gap-4",
        className,
      )}
    >
      <div
        data-testid="pr-activity-marker"
        className="relative z-10 flex min-h-8 items-start justify-center bg-background"
      >
        {marker}
      </div>
      <div
        data-testid="pr-activity-content"
        className={cn("min-w-0", contentClassName)}
      >
        {children}
      </div>
    </li>
  );
}

/** The small pointer that makes a bordered surface read as a message bubble. */
export function PrActivityBubblePointer() {
  return (
    <>
      {/* GitHub's timeline pattern uses two nested CSS triangles: the outer
          triangle continues the card border and the inner one paints the
          header. Starting after the 1rem corner keeps the seam on a straight
          edge instead of intersecting the rounded corner. */}
      <span
        aria-hidden
        data-testid="pr-activity-bubble-pointer"
        className="pointer-events-none absolute -left-4 top-[15px] z-10 size-0 border-[8px] border-solid border-transparent border-r-border"
      />
      <span
        aria-hidden
        data-testid="pr-activity-bubble-pointer-fill"
        className="pointer-events-none absolute -left-3.5 top-4 z-20 size-0 border-[7px] border-solid border-transparent border-r-[var(--activity-header)]"
      />
    </>
  );
}
