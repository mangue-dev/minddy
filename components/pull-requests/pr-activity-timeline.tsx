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
    <span
      aria-hidden
      className="absolute -left-1.5 top-3 size-3 rotate-45 border-b border-l border-border bg-muted/35"
    />
  );
}
