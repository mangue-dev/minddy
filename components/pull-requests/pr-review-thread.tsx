"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { cn, Spinner } from "mangue-ui";
import { ModelLogo } from "@/components/model-logo";
import { NumoIcon } from "@/components/numo-icon";
import { PrActivityItem } from "@/components/pull-requests/pr-activity-timeline";
import { formatModelName } from "@/lib/model-display";
import type { PrReviewRunSummary } from "@/lib/pr-review-session";

/** Prominent merge blocker shown above CI while the requested review is active. */
export function PrPendingReviewCallout({ run }: { run: PrReviewRunSummary }) {
  const t = useTranslations("PullRequests");
  const router = useRouter();

  return (
    <div
      data-testid="pr-pending-numo-review"
      className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2"
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <NumoIcon animated className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {t("numoReviewRunning")}
      </span>
      <button
        type="button"
        className="shrink-0 text-xs font-medium text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
        onClick={() => router.push(`/agents?run=${run.runId}`)}
      >
        {t("numoReviewOpenSession")}
      </button>
    </div>
  );
}

/**
 * Numo's reread IN the pull request thread (MIN-168): a card which
 * says if the agent is working, and which OPENS ITS SESSION when clicked.
 *
 * It no longer unfolds its own unfolding on site, and that's the point of the ticket :
 * a replay is no longer a separate pass with its house thread, it is a
 * agent session. Its sequence - what it read, the commands it launched,
 * the files it opened outside diff - is that of any session,
 * and `/agents` already knows how to render it. Copying a poor version here required
 * to understand the same thing twice.
 *
 * What the thread keeps: the VERDICT, which arrives as a normal comment from the
 * PR, written by Numo. This card is just the gateway to the session that
 * produced it.
 */
export function PrReviewCard({ run }: { run: PrReviewRunSummary }) {
  const t = useTranslations("PullRequests");
  const router = useRouter();

  const working = run.working;
  const failed = run.status === "failed" || run.status === "canceled";

  return (
    <PrActivityItem
      marker={
        <span className="flex size-8 items-center justify-center rounded-[6px] bg-card ring-4 ring-background">
          <NumoIcon animated={working} className="size-5" />
        </span>
      }
    >
      <button
        type="button"
        onClick={() => router.push(`/agents?run=${run.runId}`)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <span className="text-sm font-medium text-foreground">Numo</span>
        <span
          className={cn(
            "min-w-0 truncate text-xs text-muted-foreground",
            working && "text-shimmer",
          )}
        >
          {failed
            ? t("numoReviewFailed")
            : working
              ? t("numoReviewWorking")
              : t("numoReviewFinished")}
        </span>
        {working ? <Spinner className="shrink-0" /> : null}
        <span className="min-w-0 flex-1" />
        {run.model ? (
          <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground/80 sm:flex">
            <ModelLogo model={run.model} size={12} />
            {formatModelName(run.model)}
          </span>
        ) : null}
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
          {t("numoReviewOpenSession")}
          <ChevronRight className="size-3.5" />
        </span>
      </button>
    </PrActivityItem>
  );
}
