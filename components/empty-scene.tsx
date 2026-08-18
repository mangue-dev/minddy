"use client";

import type { ReactNode } from "react";
import { cn } from "mangue-ui";
import {
  IsoIcon,
  type SceneIcon,
  type SceneTone,
} from "@/components/illustrations/iso-icon";

/**
 * An empty state illustrated: the isometric block, a sentence, the gestures that make it
 * fill (MIN-173). Writing it down once is the only way to be sure
 * all fall in the same place, at the same height, with the same gaps — the
 * having copied it was enough to make them diverge.
 *
 * Two sizes, and not one more:
 * - `page` (the default) — the board, the objectives, the sorting, the trash: the
 * entire surface is empty, the illustration has room to breathe.
 * - `compact` — a SECTION of settings: the void is only one line of the
 * form, and a full-size drawing would scream louder than the
 * section itself. Same block, half as wide, gaps narrowed.
 *
 * The widths have been DIVIDED BY HALF when going from the lying icon to the block:
 * the first spread out in a diamond twice as wide as it was high, the second
 * is almost square. At equal width the illustration would have doubled in height and
 * took up all the space that the empty state left for the text.
 *
 * To be distinguished from `components/empty-state.tsx`, the small dotted box
 * which remains for internal lists (panels, subviews).
 */
export function EmptyScene({
  icon,
  title,
  size = "page",
  tone,
  children,
  className,
}: {
  /** The icon of the page or section — it is placed on the block. */
  icon: SceneIcon;
  title: string;
  size?: "page" | "compact";
  /** Drawing tint — `destructive` for what deletes (the trash). */
  tone?: SceneTone;
  /** Stocks, side by side. None on a surface that fills itself. */
  children?: ReactNode;
  className?: string;
}) {
  const compact = size === "compact";
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "gap-3 px-4 py-6" : "gap-6 px-6 py-16",
        className
      )}
    >
      <IsoIcon icon={icon} tone={tone} className={compact ? "w-20" : "w-36"} />
      <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>
        {title}
      </p>
      {children ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-center",
            compact ? "gap-2" : "gap-3"
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
