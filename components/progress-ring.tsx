"use client";

import { cn } from "mangue-ui";

/**
 * The app's progress ring: filled clockwise from noon
 * — the `Pie` of ticket indicators, but in DASH, so that it reads as
 * a gauge and not a status.
 *
 * Born on the cycle (MIN-32), it is since the unique form of “what is done
 * on what remains”: the cycle, and the objective wherever its progress reads
 * (column, detail header, board banner). A horizontal bar requires
 * a width that a list line does not have; the ring fits in the place of a
 * icon.
 */
export function ProgressRing({
  percent,
  colorClass,
  className,
}: {
  percent: number;
  /** Tailwind text-color of the progress arc. */
  colorClass: string;
  className?: string;
}) {
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn("size-[19px] shrink-0 -rotate-90", className)}
    >
      <circle cx="8" cy="8" r={r} stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.5" />
      <circle
        cx="8"
        cy="8"
        r={r}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${(Math.min(100, Math.max(0, percent)) / 100) * c} ${c}`}
        className={colorClass}
      />
    </svg>
  );
}
