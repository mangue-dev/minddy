"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { isPrWorthShowing, type IssuePr } from "@/lib/agent-api";
import type { IssuePrReadiness } from "@/lib/issue-pr-store";
import { usePullRequestReadinessBatchQuery } from "@/lib/use-agent-runs";
import { IssueCardPullRequestContent, pullRequestChip } from "@/components/issue-card-face";
import { PullRequestHoverCard } from "@/components/pull-requests/pr-hover-card";
import { PrReadinessIcon } from "@/components/pull-requests/pr-readiness";

/** Same polling floor as the boards: realtime invalidation does the rest. */
const PANEL_READINESS_POLL_MS = 5 * 60_000;

/**
 * The pull request chip of the issue panel header (MIN-46 / MIN-68). It shows
 * what the issue card shows: the PR number in GitHub's colors and, while the
 * PR is open, its CI readiness. Only a PR that calls for action appears —
 * live (open, draft) or delivered (merged); click = the review, hover = where
 * it stands (MIN-888). A closed PR stays silent; the “⋯” menu still leads to it.
 */
export function IssuePrChip({
  pr,
  readiness,
  onOpenPr,
}: {
  /** The PR of the ticket, all states combined — the chip itself discards `closed`. */
  pr: IssuePr | null;
  /** The board's readiness of this PR, when the panel opens over a board. */
  readiness?: IssuePrReadiness | null;
  onOpenPr: () => void;
}) {
  const t = useTranslations("Agent");
  const shown = pr && isPrWorthShowing(pr) ? pr : null;
  const open = shown?.state === "open";
  // Off a board (Pull requests page, feedback board) nothing holds the
  // readiness: the panel reads it for this PR alone, in the batch query the
  // hover card shares.
  const readOwn = open && !readiness;
  const own = usePullRequestReadinessBatchQuery(readOwn && shown ? [shown.prId] : [], { minPollMs: PANEL_READINESS_POLL_MS });

  if (!pr || !shown) return null;
  const known: IssuePrReadiness | null = readOwn
    ? own.loading
      ? null
      : {
          readiness: own.readinessByPrId[pr.prId] ?? null,
          unavailable: own.error || own.unavailablePrIds.has(pr.prId),
          flow: own.mergeFlowByPrId[pr.prId] ?? null,
        }
    : readiness ?? null;
  const { label: stateLabel, tone, hover } = pullRequestChip(pr.state, t);

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <PullRequestHoverCard pr={pr} readiness={known} onOpen={onOpenPr}>
        <button
          type="button"
          onClick={onOpenPr}
          aria-label={`${t("viewPullRequest")} #${pr.prNumber}, ${stateLabel}`}
          className={cn(
            "flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium outline-none transition-colors",
            tone,
            hover,
          )}
        >
          <IssueCardPullRequestContent state={pr.state} number={pr.prNumber} />
        </button>
      </PullRequestHoverCard>
      {known && open ? (
        <PrReadinessIcon readiness={known.readiness} unavailable={known.unavailable}
          autoMerge={!!known.flow?.active} />
      ) : null}
    </span>
  );
}
