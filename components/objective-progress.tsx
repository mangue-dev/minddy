"use client";

import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { ProgressRing } from "@/components/progress-ring";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The progress of an objective, in its compact form: the ring of the cycle and, on the side, the count of closed tickets.
 *
 * The two do NOT say the same thing, and that's why they coexist:
 * the ring is weighted by the effort (a finished XL in front of a remaining XS fills the
 * nine tenths of the circle), the count is gross (“1/2”). The first says where en
 * is the work, the second how many tickets remain to be closed.
 *
 * Written once for the two surfaces carrying it — the column row
 * and the detail header: they have diverged once already, one showing a
 * percentage that the other was silent.
 */
export function ObjectiveProgressStat({
  progress,
  countFirst,
  tooltip,
  className,
}: {
  progress: { done: number; total: number; percent: number };
  /**
 * The count BEFORE the ring. This is the shape of the column: the ring falls
 * then on its right edge, at the same abscissa from one line to the other, and it is
 * this alignment that we run our eyes over.
 */
  countFirst?: boolean;
  /**
 * The percentage on hover. Reserved for surfaces where we STOP (the header
 * of an open objective): in a list that we scan, one tooltip per line
 * hovered over is noise, not information.
 */
  tooltip?: boolean;
  className?: string;
}) {
  const t = useTranslations("Objectives");

  const ring = (
    <ProgressRing percent={progress.percent} colorClass="text-emerald-500" />
  );
  const count = (
    <span>
      {progress.done}/{progress.total}
    </span>
  );

  const stat = (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground",
        className
      )}
    >
      {countFirst ? (
        <>
          {count}
          {ring}
        </>
      ) : (
        <>
          {ring}
          {count}
        </>
      )}
    </span>
  );

  if (!tooltip) return stat;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{stat}</TooltipTrigger>
      <TooltipContent>
        {t("progressTooltip", { percent: progress.percent })}
      </TooltipContent>
    </Tooltip>
  );
}
