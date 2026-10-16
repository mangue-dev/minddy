"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { GitPullRequestIcon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { isPrWorthShowing, type IssuePr } from "@/lib/agent-api";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The pull request chip of the issue panel header (MIN-46 / MIN-68). It only
 * shows a PR that calls for action — live (open, draft) or delivered
 * (merged); click = the review. A closed PR stays silent; the “⋯” menu still
 * leads to it.
 */
export function IssuePrChip({
  pr,
  onOpenPr,
}: {
  /** The PR of the ticket, all states combined — the chip itself discards `closed`. */
  pr: IssuePr | null;
  onOpenPr: () => void;
}) {
  const t = useTranslations("Agent");

  // A REFUSED PR no longer calls for anything: the chip remains silent. The “⋯” menu, there
  // leads anyway — that's what happened on this ticket.
  if (!isPrWorthShowing(pr)) return null;
  const merged = pr?.state === "merged";
  const draft = pr?.state === "draft";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpenPr}
          aria-label={t("viewPullRequest")}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium outline-none transition-colors",
            merged
              ? "text-violet-600 hover:bg-violet-500/10 focus-visible:bg-violet-500/10 dark:text-violet-400"
              : "text-emerald-600 hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10 dark:text-emerald-500"
          )}
        >
          <HugeiconsIcon icon={GitPullRequestIcon} className="size-3.5 shrink-0" />
          <span className="truncate">
            {merged ? t("prMerged") : draft ? t("prBadge") : t("prOpen")}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("viewPullRequest")}</TooltipContent>
    </Tooltip>
  );
}
