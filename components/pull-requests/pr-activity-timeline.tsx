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
        "relative grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-start gap-2.5 sm:gap-3",
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
    <svg
      aria-hidden
      data-testid="pr-activity-bubble-pointer"
      viewBox="0 0 10 18"
      className="pointer-events-none absolute -left-[9px] top-[11px] z-10 h-[18px] w-[10px] overflow-visible"
    >
      {/* The open path draws only the two diagonals. Its fill overlaps the
          card by one pixel, masking the vertical border where the notch joins. */}
      <path
        d="M10 0.5 L0.75 9 L10 17.5"
        vectorEffect="non-scaling-stroke"
        className="fill-[var(--activity-header)] stroke-border"
      />
    </svg>
  );
}
