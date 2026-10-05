"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { AlertCircleIcon, ArrowUpRight01Icon, BubbleChatIcon, GitBranchIcon, GitMergeIcon, GitPullRequestDraftIcon, Shield01Icon, ArrowDown01Icon, CheckIcon, UserRoundCheckIcon as UserRoundCheck, ViewIcon, Wrench01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "mangue-ui";

import { PrReviewsDetails } from "@/components/pull-requests/pr-reviews-details";
import { reviewerReviewGroups, reviewCardTone } from "@/lib/pr-review-request";
import type { PrTimelineEvent } from "@/lib/pr-timeline";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { PrInsightRow, type PrInsightTone } from "@/components/pull-requests/pr-insight-row";
import { CheckLogo } from "@/components/pull-requests/pr-check-logo";
import { NumoIcon } from "@/components/numo-icon";
import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import type {
  CheckState,
  ChecksSummary,
} from "@/lib/agent-api";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { MessageKey } from "@/lib/i18n-keys";
import type { PullRequestFeedbackThread } from "@/lib/pr-unresolved-conversations";
import type {
  PullRequestReadiness,
  ReadinessAction,
  ReadinessBlocker,
} from "@/lib/pr-readiness";
import type { AiReviewStatus } from "@/lib/pr-ai-review";
import type { AiReviewProvider, AiReviewState } from "@/lib/pr-ai-review/types";
import type { PrDeploymentStory } from "@/lib/pr-deployment-story";

/** Short feedback after an action is activated. */
export type PrActionFeedback = "copied" | "opened" | "launched";

const FEEDBACK_KEYS: Record<
  PrActionFeedback,
  MessageKey<"PullRequests">
> = {
  copied: "cardFeedbackCopied",
  opened: "cardFeedbackOpened",
  launched: "cardFeedbackLaunched",
};

/** How long an action displays its feedback. */
const ACTION_FEEDBACK_MS = 1_600;

/** Alpha background of a check row, tinted by its own state. */
const CHECK_ROW_BG: Record<CheckState, string> = {
  success: "bg-emerald-500/10",
  pending: "bg-amber-500/10",
  failure: "bg-red-500/10",
  neutral: "bg-muted/50",
};

/** Name and timer of a check row, a shade more saturated than its row
    background — the same grammar as the merge-state popover rows. The
    description below stays muted. */
const CHECK_ROW_TEXT: Record<CheckState, string> = {
  success: "text-emerald-700 dark:text-emerald-400",
  pending: "text-amber-700 dark:text-amber-400",
  failure: "text-destructive",
  neutral: "text-foreground",
};

/** “42 s”, “3 min 7 s”. `null` when the forge does not date the run. */
function formatRunDuration(
  t: ReturnType<typeof useTranslations<"PullRequests">>,
  durationMs: number | null,
): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0)
    return null;
  const seconds = Math.round(durationMs / 1000);
  return seconds < 60
    ? t("checkDurationSeconds", { seconds })
    : t("checkDurationMinutes", {
        minutes: Math.floor(seconds / 60),
        seconds: seconds % 60,
      });
}

interface PrInsight {
  id: string;
  tone: PrInsightTone;
  title: string;
  /** Final duration, frozen. `null` = the insight carries no time. */
  durationMs: number | null;
  /** Live timer — the duration recomputes on every tick until it settles. */
  startedAt: string | null;
  updatedAt?: string;
  logo?: string;
  donutParts: CheckState[] | null;
  iconKind: ReadinessBlocker["kind"];
  /** Opens the related conversation or external activity. */
  onSelect?: () => void;
  /** Label for the related activity action. */
  openLabel?: string;
  /** An action shown in the expanded details. */
  action?: {
    label: string;
    onClick: () => void;
    testId?: string;
    disabled?: boolean;
  };
  /** Paired actions with short feedback after activation. */
  actions?: {
    top: {
      label: string;
      onClick: () => void;
      testId?: string;
      feedback?: PrActionFeedback;
    };
    bottom: {
      label: string;
      onClick: () => void;
      testId?: string;
      disabled?: boolean;
      feedback?: PrActionFeedback;
    };
  };
}

/** Numo review status and actions, embedded in the reviews disclosure. */
export interface PrNumoReviewSpec {
  kind: "running" | "current" | "requested";
  label: string;
  /** Opens the review conversation in the Numo panel. */
  onOpen: (() => void) | null;
  /** Live clock of a running review. */
  startedAt: string | null;
  /** Settled duration of the completed pass. */
  durationMs: number | null;
}

interface PrInsightsProps {
  readiness: PullRequestReadiness | null;
  checks: ChecksSummary | null;
  provider: RepoProviderId;
  /** The deployment story as the forge reported it, made sticky by the
      caller — the insight never tears down mid-build. */
  deployment: PrDeploymentStory | null;
  conversationThreads: PullRequestFeedbackThread[];
  timeline: PrTimelineEvent[];
  requestedReviewers: { login: string; avatar_url: string | null }[];
  canRequestReviewer: boolean;
  onRequestReviewer: () => void;
  canAct: (blocker: ReadinessBlocker) => boolean;
  acting: ReadinessAction | null;
  onAction: (blocker: ReadinessBlocker) => void;
  onOpenConversations: () => void;
  onOpenReviewApprove: () => void;
  onStartFileReview: () => void;
  aiReviews?: AiReviewStatus[];
  requestingReviewer?: string | null;
  onRequestAiReview?: (provider: AiReviewProvider) => void;
  numoReview: PrNumoReviewSpec | null;
  /** A running correction links to its Numo conversation from the popover. */
  fixRun: { startedAt: string | null; onOpen: () => void } | null;
  /** A "generate then merge" job (MIN-548) runs in the background: Numo
      writes the commit message, the merge fires the moment it lands. The
      caller keeps the marker alive across navigation — the job does not
      belong to the page that launched it. */
  numoMerge: { startedAt: string | null } | null;
  /** The merge-state control can also open the checks popover. */
  checksOpen: boolean;
  onChecksOpenChange: (open: boolean) => void;
  onRequestReview: () => void;
  /** The fix gesture of a failing PR (MIN-548 review): copy the prompt, or
      hand the PR to Numo. `null` = nothing is failing. */
  fix: {
    canLaunch: boolean;
    onLaunch: () => void;
    onCopy: () => void;
  } | null;
}

/** Keep a fixed order within the blocking and non-blocking property groups. */
export function PrInsights(props: PrInsightsProps) {
  const t = useTranslations("PullRequests");
  const now = useNow({ updateInterval: 1_000 });
  const [blockersOpen, setBlockersOpen] = useState(true);
  const insights = buildInsights(t, props);
  const fixInsight = insights.find(({ insight }) => insight.id === "fix")?.insight;
  const checksInsight = insights.find((entry) => entry.isChecks)!.insight;
  const reviews = insights.filter(({ insight }) =>
    insight.id !== "reviews" && (insight.id === "numo-review" || insight.id.startsWith("ai-review-") ||
    ["review_requested", "changes_requested", "approvals"].includes(insight.iconKind)),
  );
  const groups = reviewerReviewGroups(props.timeline);
  const count = groups.reduce((total, group) => total + group.length, 0);
  const latest = groups.map((group) => group[0]);
  const humanTone = reviewCardTone(props.timeline, props.requestedReviewers);
  const reviewerAvatars = latest.length > 0
    ? latest.flatMap((review) => review.actor ? [review.actor] : [])
    : props.requestedReviewers;
  const reviewTone = reviews.some(({ insight }) => insight.tone === "danger") ||
    humanTone === "danger"
    ? "danger"
    : props.requestedReviewers.length > 0 || reviews.some(({ insight }) => insight.tone === "progress")
      ? "progress"
      : reviews.some(({ insight }) => insight.tone === "success") ||
          humanTone === "success"
        ? "success"
        : "neutral";
  const reviewStatus = reviews.find(({ insight }) => insight.tone === reviewTone && insight.tone !== "neutral");
  const reviewSummary = reviewStatus?.insight.title ?? (
    humanTone === "danger"
      ? t("cardChangesRequested", { count: latest.filter((review) => review.reviewState === "changes_requested").length })
      : props.requestedReviewers.length > 0
        ? t("pendingReviewRequests")
        : humanTone === "success"
          ? t("approvals", { count: latest.filter((review) => review.reviewState === "approved").length })
          : count > 0 ? t("cardReviews", { count }) : t("noReviews")
  );
  const other = insights.filter((entry) => !entry.isChecks && entry.insight.id !== "fix" && entry.insight.id !== "reviews" && !reviews.includes(entry));
  const rest = [...other.filter(({ insight }) => insight.id === "conversations"), ...other.filter(({ insight }) => insight.id !== "conversations")];

  useEffect(() => {
    if (props.checksOpen && checksInsight.tone === "danger") setBlockersOpen(true);
  }, [props.checksOpen, checksInsight.tone]);

  const rows = [
    {
      id: "checks",
      tone: checksInsight.tone,
      content: (
        <PrInsightRow
          label={t("insightChecks")}
          tone={checksInsight.tone}
          testId="pr-status-card-checks"
          detailsTestId="pr-checks-popover"
          open={props.checksOpen}
          onOpenChange={props.onChecksOpenChange}
          summary={<StatusSummary insight={checksInsight} now={now} />}
        >
          <ChecksDetails checks={props.checks} provider={props.provider} />
        </PrInsightRow>
      ),
    },
    {
      id: "reviews",
      tone: reviewTone,
      content: (
        <PrInsightRow
          label={t("reviewsTitle")}
          tone={reviewTone}
          testId="pr-status-card-reviews"
          detailsTestId="pr-reviews-popover"
          summary={
            <>
              {reviewerAvatars.length > 0 ? <AvatarCascade users={reviewerAvatars} /> : null}
              {props.numoReview && props.numoReview.kind !== "requested" ? <NumoIcon animated={false} className="size-4 shrink-0" /> : null}
              <span className="min-w-0 truncate">{reviewSummary}</span>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {reviews.map(({ insight }) => <StatusDetails key={insight.id} insight={insight} now={now} />)}
            <PrReviewsDetails
              timeline={props.timeline}
              requestedReviewers={props.requestedReviewers}
              canRequest={props.canRequestReviewer}
              onRequest={props.onRequestReviewer}
            />
          </div>
        </PrInsightRow>
      ),
    },
    ...rest.map(({ insight }) => ({
      id: insight.id,
      tone: insight.tone,
      content: <PrInsightView insight={insight} now={now} />,
    })),
  ];
  const blocked = rows.filter((row) => row.tone === "danger");

  return (
    <div data-testid="pr-insights" className="flex w-full min-w-0 flex-col gap-2">
      {blocked.length > 0 || fixInsight ? (
        <Collapsible open={blockersOpen} onOpenChange={setBlockersOpen} data-testid="pr-insight-blockers">
          <div data-testid="pr-insight-blockers-header" className="flex min-w-0 items-center gap-2">
            <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 rounded py-1 text-left text-sm font-medium text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0" />
              <span className="shrink-0">{t("insightBlockers")}</span>
              {blocked.length > 0 ? <span className="text-xs tabular-nums">{blocked.length}</span> : null}
              <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden className="ml-auto size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            {fixInsight ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="pr-fix-action" className="min-w-0">
                    <HugeiconsIcon icon={Wrench01Icon} className="size-4 shrink-0" />
                    <span className="min-w-0 truncate">{t("cardFix")}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" data-testid="pr-fix-popover" className="w-[min(26rem,calc(100vw-2rem))] p-3">
                  <StatusDetails insight={fixInsight} now={now} />
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
          <CollapsibleContent>
            <div className="flex min-w-0 flex-col pt-2">
              {blocked.map((row) => <div key={row.id}>{row.content}</div>)}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      <div className="flex min-w-0 flex-col">
        {rows.filter((row) => row.tone !== "danger").map((row) => <div key={row.id}>{row.content}</div>)}
      </div>
    </div>
  );
}

function pushCheck(
  insights: { insight: PrInsight; isChecks: boolean }[],
  insight: PrInsight,
) {
  insights.push({ insight, isChecks: true });
}

function buildInsights(
  t: ReturnType<typeof useTranslations<"PullRequests">>,
  props: PrInsightsProps,
): { insight: PrInsight; isChecks: boolean }[] {
  const insights: { insight: PrInsight; isChecks: boolean }[] = [];
  const { readiness, checks, conversationThreads } = props;
  const blockers = readiness?.blockers ?? [];
  const push = (insight: PrInsight, isChecks = false) =>
    insights.push({ insight, isChecks });
  const blockerAction = (blocker: ReadinessBlocker) => () => {
    props.onAction(blocker);
  };
  const busy = props.acting !== null;

  // Corrections keep both copy and launch actions available.
  if (props.fix) {
    push({
      id: "fix",
      tone: "danger",
      title: t("cardFix"),
      durationMs: null,
      startedAt: null,
      donutParts: null,
      iconKind: "checks",
      actions: {
        top: {
          label: t("cardFixCopyPrompt"),
          onClick: props.fix.onCopy,
          testId: "pr-card-fix-copy",
          feedback: "copied",
        },
        bottom: {
          label: t("cardFixLaunchNumo"),
          onClick: props.fix.onLaunch,
          disabled: !props.fix.canLaunch,
          testId: "pr-card-fix-launch",
          feedback: "launched",
        },
      },
    });
  }

  // Failure wins over progress; the timer runs until all checks settle.
  if (checks && checks.total > 0) {
    const states = checks.checks.map((check) => check.state);
    const passed = states.filter((state) => state === "success").length;
    const pending = states.filter((state) => state === "pending").length;
    const failed = states.filter((state) => state === "failure").length;
    const durationMs =
      checks.startedAt && checks.completedAt
        ? Date.parse(checks.completedAt) - Date.parse(checks.startedAt)
        : null;
    pushCheck(insights, {
      id: "checks",
      tone: failed > 0 ? "danger" : pending > 0 ? "progress" : states.every((state) => state === "neutral") ? "neutral" : "success",
      title: failed > 0
        ? t("cardChecksFailed", { count: failed })
        : pending > 0
          ? t("cardChecksRunning", { count: pending })
          : states.every((state) => state === "neutral")
            ? t("checkStateNeutral")
            : t("cardChecksPassed", { count: passed }),
      donutParts: states,
      startedAt: pending > 0 ? checks.startedAt : null,
      durationMs: pending > 0 ? null : durationMs,
      iconKind: "checks",
    });
  } else {
    pushCheck(insights, {
      id: "checks",
      tone: "neutral",
      title: checks ? t("insightNoChecks") : t("readinessUnavailable"),
      durationMs: null,
      startedAt: null,
      donutParts: null,
      iconKind: "checks",
    });
  }

  // The caller preserves deployment data across temporary empty polls.
  const deployment = props.deployment;
  const deploymentActions = (url: string): PrInsight["actions"] => ({
    top: {
      label: t("cardCopyLink"),
      onClick: () => {
        void navigator.clipboard.writeText(url).catch(() => {});
      },
      testId: "pr-card-copy-deployment",
      feedback: "copied",
    },
    bottom: {
      label: t("viewDeployment"),
      onClick: () => window.open(url, "_blank", "noreferrer"),
      testId: "pr-card-view-deployment",
      feedback: "opened",
    },
  });
  if (deployment?.status === "in_progress") {
    push({
      id: "deployment",
      tone: "progress",
      title: t("cardDeploymentRunning"),
      durationMs: null,
      startedAt: deployment.startedAt,
      donutParts: null,
      iconKind: "mergeability",
      actions: deployment.url ? deploymentActions(deployment.url) : undefined,
    });
  } else if (deployment?.status === "success" && deployment.url) {
    push({
      id: "deployment",
      tone: "success",
      title: t("cardDeploymentPassed"),
      durationMs: deployment.durationMs,
      startedAt: null,
      donutParts: null,
      iconKind: "mergeability",
      actions: deploymentActions(deployment.url),
    });
  }

  for (const review of props.aiReviews ?? []) {
    const active = review.state === "running" || review.state === "requested";
    const tone: PrInsightTone = active ? "progress" : review.state === "findings" || review.state === "failed" ? "danger" : (review.state === "clean" || review.state === "completed") ? "success" : "neutral";
    const labels: Record<AiReviewState, MessageKey<"PullRequests">> = {
      requested: "cardAiReviewRequested", running: "cardAiReviewRunning",
      completed: "cardAiReviewCompleted", clean: "cardAiReviewClean",
      findings: "cardAiReviewFindings", failed: "cardAiReviewFailed", skipped: "cardAiReviewSkipped",
    };
    const request = !active && props.onRequestAiReview ? {
      label: props.requestingReviewer === review.provider.id ? t("cardAiReviewSending") : t("cardAiReviewRequestAgain"),
      onClick: () => props.onRequestAiReview?.(review.provider),
      disabled: !!props.requestingReviewer,
      testId: `pr-card-request-${review.provider.id}`,
    } : undefined;
    const open = review.url ? () => window.open(review.url!, "_blank", "noreferrer") : undefined;
    push({
      id: `ai-review-${review.provider.id}`, tone, logo: review.provider.logo,
      title: t(labels[review.state], { provider: review.provider.name }),
      startedAt: review.state === "running" ? review.startedAt : null,
      durationMs: review.durationMs, updatedAt: review.updatedAt,
      donutParts: null, iconKind: "review_requested",
      actions: open && request ? {
        top: { label: t("cardAiReviewView"), onClick: open }, bottom: request,
      } : undefined,
      action: !open ? request : undefined,
      onSelect: open && !request ? open : undefined,
      openLabel: open && !request ? t("cardAiReviewView") : undefined,
    });
  }

  // Numo shares the reviews disclosure with human and external reviewers.
  const numoReview = props.numoReview;
  if (numoReview) {
    if (numoReview.kind === "requested") {
      push({
        id: "numo-review",
        // The ask is a gesture, not a verdict: the insight carries no state
        // color, the action alone speaks (MIN-548).
        tone: "neutral",
        title: numoReview.label,
        durationMs: null,
        startedAt: null,
        donutParts: null,
        iconKind: "mergeability",
        action: {
          label: t("aiReview"),
          onClick: props.onRequestReview,
          disabled: busy,
          testId: "pr-card-numo-review",
        },
      });
    } else {
      push({
        id: "numo-review",
        tone: numoReview.kind === "running" ? "progress" : "success",
        title: numoReview.label,
        durationMs: numoReview.durationMs,
        startedAt: numoReview.startedAt,
        donutParts: null,
        iconKind: "mergeability",
        // Older runs may not have a conversation to open.
        openLabel: numoReview.onOpen ? t("numoReviewOpenSession") : undefined,
        onSelect: numoReview.onOpen ?? undefined,
      });
    }
  }

  // Corrections and merging remain separate from review work.
  if (props.fixRun) {
    push({
      id: "numo-fix",
      tone: "progress",
      title: t("numoFixRunning"),
      durationMs: null,
      startedAt: props.fixRun.startedAt,
      donutParts: null,
      iconKind: "mergeability",
      openLabel: t("numoReviewOpenSession"),
      onSelect: props.fixRun.onOpen,
    });
  }

  if (props.numoMerge) {
    push({
      id: "numo-merge",
      tone: "progress",
      title: t("cardNumoMerging"),
      durationMs: null,
      startedAt: props.numoMerge.startedAt,
      donutParts: null,
      iconKind: "mergeability",
    });
  }

  // ── Blockers ────────────────────────────────────────────────────────────
  for (const blocker of blockers) {
    // Checks already have their own disclosure.
    if (blocker.kind === "checks") continue;
    const tone: PrInsightTone =
      blocker.status === "pending" ? "progress" : "danger";
    const available = props.canAct(blocker);
    switch (blocker.kind) {
      case "draft":
        push({
          id: blocker.id,
          tone,
          title: t("readinessDraft"),
          durationMs: null,
          startedAt: null,
          donutParts: null,
          iconKind: blocker.kind,
          action: available
            ? {
                label: t("blockerActionMarkReady"),
                onClick: blockerAction(blocker),
                disabled: busy,
                testId: "pr-card-mark-ready",
              }
            : undefined,
        });
        break;
      case "review_requested":
        push({
          id: blocker.id,
          tone,
          title: t("cardReviewRequested"),
          durationMs: null,
          startedAt: null,
          donutParts: null,
          iconKind: blocker.kind,
          action: {
            label: t("reviewStart"),
            onClick: props.onStartFileReview,
            testId: "pr-card-start-review",
          },
        });
        break;
      case "changes_requested":
        push({
          id: blocker.id,
          tone,
          title: t("cardChangesRequested", { count: blocker.count ?? 0 }),
          durationMs: null,
          startedAt: null,
          donutParts: null,
          iconKind: blocker.kind,
        });
        break;
      case "approvals":
        push({
          id: blocker.id,
          tone,
          title: t("cardApprovalsMissing", {
            count: Math.max((blocker.expected ?? 0) - (blocker.count ?? 0), 0),
          }),
          durationMs: null,
          startedAt: null,
          donutParts: null,
          iconKind: blocker.kind,
          action: available
            ? {
                label: t("blockerActionApprove"),
                onClick: props.onOpenReviewApprove,
                testId: "pr-card-approve",
              }
            : undefined,
        });
        break;
      case "conversations":
        break;
      case "branch":
        push({
          id: blocker.id,
          tone,
          title: t("readinessBranchOutOfDate"),
          durationMs: null,
          startedAt: null,
          donutParts: null,
          iconKind: blocker.kind,
          action: available
            ? {
                label: t("blockerActionUpdateBranch"),
                onClick: blockerAction(blocker),
                disabled: busy,
                testId: "pr-card-update-branch",
              }
            : undefined,
        });
        break;
      case "conflicts":
        push({
          id: blocker.id,
          tone,
          title: t("readinessConflicts"),
          durationMs: null,
          startedAt: null,
          donutParts: null,
          iconKind: blocker.kind,
        });
        break;
      case "policy":
        push({
          id: blocker.id,
          tone,
          title: t("readinessPolicyBlocked"),
          durationMs: null,
          startedAt: null,
          donutParts: null,
          iconKind: blocker.kind,
          action:
            available && blocker.action === "enable_auto_merge"
              ? {
                  label: t("blockerActionAutoMerge"),
                  onClick: blockerAction(blocker),
                  disabled: busy,
                  testId: "pr-card-auto-merge",
                }
              : undefined,
        });
        break;
      case "mergeability":
        push({
          id: blocker.id,
          tone,
          title: t("readinessUnavailable"),
          durationMs: null,
          startedAt: null,
          donutParts: null,
          iconKind: blocker.kind,
        });
        break;
    }
  }

  const resolvedCount = conversationThreads.filter(
    (thread) => thread.resolution?.resolved === true,
  ).length;
  const allResolved =
    conversationThreads.length > 0 &&
    resolvedCount === conversationThreads.length;
  if (conversationThreads.length > 0) push({
    id: "conversations",
    tone:
      conversationThreads.length === 0
        ? "neutral"
        : allResolved
          ? "success"
          : blockers.some((blocker) => blocker.kind === "conversations" && blocker.status === "blocked")
            ? "danger"
            : "progress",
    title: t("conversationsProgress", { resolved: resolvedCount, total: conversationThreads.length }),
    durationMs: null,
    startedAt: null,
    donutParts:
      conversationThreads.length > 0 && !allResolved
        ? conversationThreads.map((thread) =>
            thread.resolution?.resolved === true
              ? "success"
              : thread.resolution?.resolved === false
                ? blockers.some((blocker) => blocker.kind === "conversations" && blocker.status === "blocked") ? "failure" : "pending"
                : "neutral",
          )
        : null,
    iconKind: "conversations",
    openLabel: t("viewConversations"),
    onSelect: props.onOpenConversations,
  });

  return insights;
}

function blockerIcon(kind: ReadinessBlocker["kind"]) {  switch (kind) {
    case "conversations":
      return <HugeiconsIcon icon={BubbleChatIcon} />;
    case "draft":
      return <HugeiconsIcon icon={GitPullRequestDraftIcon} />;
    case "review_requested":
      return <HugeiconsIcon icon={ViewIcon} />;
    case "changes_requested":
      return <HugeiconsIcon icon={AlertCircleIcon} />;
    case "approvals":
      return <AppIcon icon={UserRoundCheck} />;
    case "branch":
      return <HugeiconsIcon icon={GitBranchIcon} />;
    case "conflicts":
      return <HugeiconsIcon icon={GitMergeIcon} />;
    case "policy":
      return <HugeiconsIcon icon={Shield01Icon} />;
    case "mergeability":
    case "checks":
      return <HugeiconsIcon icon={AlertCircleIcon} />;
  }
}

function StatusIcon({ insight }: { insight: PrInsight }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center [&_svg]:size-4">
      {insight.logo ? (
        <span className="inline-block size-4 bg-current [mask-repeat:no-repeat] [mask-position:center] [mask-size:contain]" style={{ maskImage: `url(${insight.logo})`, WebkitMaskImage: `url(${insight.logo})` }} />
      ) : insight.donutParts ? (
        <ChecksDonut parts={insight.donutParts} />
      ) : insight.id === "conversations" && insight.tone === "success" ? (
        <HugeiconsIcon icon={CheckIcon} />
      ) : insight.id === "deployment" ? (
        <HugeiconsIcon icon={ArrowUpRight01Icon} />
      ) : insight.id.startsWith("numo-") ? (
        <NumoIcon animated={false} />
      ) : insight.id === "fix" ? (
        <HugeiconsIcon icon={Wrench01Icon} />
      ) : (
        blockerIcon(insight.iconKind)
      )}
    </span>
  );
}

function StatusSummary({ insight, now }: { insight: PrInsight; now: Date }) {
  const t = useTranslations("PullRequests");
  const duration = insight.startedAt
    ? formatRunDuration(t, Math.max(now.getTime() - Date.parse(insight.startedAt), 0))
    : formatRunDuration(t, insight.durationMs);
  return (
    <>
      <StatusIcon insight={insight} />
      <AppTooltip label={insight.title}><span className="min-w-0 truncate">{insight.title}</span></AppTooltip>
      {duration ? <span className="shrink-0 font-mono text-xs tabular-nums">{duration}</span> : null}
    </>
  );
}

function PrInsightView({ insight, now }: { insight: PrInsight; now: Date }) {
  const t = useTranslations("PullRequests");
  const label = insight.id === "conversations" ? t("conversationsTitle")
    : insight.id === "deployment" ? t("insightDeployment")
      : insight.id === "fix" || insight.id === "numo-fix" ? t("insightFix")
        : insight.id === "numo-merge" ? t("insightMerge")
          : insight.iconKind === "branch" ? t("insightBranch")
            : insight.iconKind === "policy" ? t("insightPolicy")
              : t("insightMergeability");
  return (
    <PrInsightRow
      label={label}
      tone={insight.tone}
      testId={`pr-status-card-${insight.id}`}
      summary={<StatusSummary insight={insight} now={now} />}
    >
      <StatusDetails insight={insight} now={now} />
    </PrInsightRow>
  );
}

/** Actions stay visible when expanded, including on touch screens. */
function StatusDetails({ insight, now }: { insight: PrInsight; now: Date }) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const [pressed, setPressed] = useState<"top" | "bottom" | null>(null);
  useEffect(() => {
    if (!pressed) return;
    const timer = setTimeout(() => setPressed(null), ACTION_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [pressed]);
  const actions = insight.actions;
  return (
    <section data-testid={`pr-insight-detail-${insight.id}`} className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
        {insight.id === "numo-review" && insight.action ? <><StatusIcon insight={insight} /><span>{t("numoAuthor")}</span></> : <StatusSummary insight={insight} now={now} />}
      </div>
      {insight.updatedAt ? (
        <time dateTime={insight.updatedAt} className="text-xs text-muted-foreground">
          {format.dateTime(new Date(insight.updatedAt), { dateStyle: "medium", timeStyle: "short" })}
        </time>
      ) : null}
      {actions ? (
        <div className="flex flex-wrap gap-2">
          {(["top", "bottom"] as const).map((which) => {
            const action = actions[which];
            return (
              <Button
                key={which}
                variant="outline"
                size="sm"
                data-testid={action.testId}
                disabled={which === "bottom" && actions.bottom.disabled}
                onClick={() => { setPressed(which); action.onClick(); }}
              >
                {pressed === which && action.feedback ? t(FEEDBACK_KEYS[action.feedback]) : action.label}
              </Button>
            );
          })}
        </div>
      ) : insight.action ? (
        <Button variant="outline" size="sm" className="self-start" data-testid={insight.action.testId} disabled={insight.action.disabled} onClick={insight.action.onClick}>
          {insight.action.label}
        </Button>
      ) : insight.onSelect ? (
        <Button variant="outline" size="sm" className="self-start" onClick={insight.onSelect}>
          {insight.openLabel}
        </Button>
      ) : null}
    </section>
  );
}

function ChecksDetails({ checks, provider }: { checks: ChecksSummary | null; provider: RepoProviderId }) {
  const t = useTranslations("PullRequests");
  const now = useNow({ updateInterval: 1_000 });
  const stateLabels: Record<CheckState, MessageKey<"PullRequests">> = {
    success: "checkStateSuccess", failure: "checkStateFailure",
    pending: "checkStatePending", neutral: "checkStateNeutral",
  };
  if (!checks || checks.total === 0) {
    return <p className="text-sm text-muted-foreground">{t(checks ? "checksNone" : "checksUnavailable")}</p>;
  }
  return (
    <ul data-testid="pr-checks-details" className="flex max-h-80 flex-col gap-1 overflow-y-auto">
      {checks.checks.map((check) => (
        <li key={`${check.appName ?? provider}-${check.name}`} data-testid="pr-check-row" className={cn("flex items-center gap-2 rounded-md px-2 py-2", CHECK_ROW_BG[check.state])}>
          <CheckLogo url={check.appAvatarUrl} provider={provider} />
          <div className="min-w-0 flex-1">
            <p className={cn("break-words text-sm font-medium", CHECK_ROW_TEXT[check.state])}>{check.name}</p>
            <p className={cn("text-xs", CHECK_ROW_TEXT[check.state])}>
              {t(stateLabels[check.state])}
              {check.required ? ` · ${t("checkRequired")}` : ""}
            </p>
            {check.description ? <p className="break-words text-xs text-muted-foreground">{check.description}</p> : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
            <span className={cn("font-mono tabular-nums", CHECK_ROW_TEXT[check.state])}>
              {formatRunDuration(t, check.state === "pending" && check.startedAt ? Math.max(now.getTime() - Date.parse(check.startedAt), 0) : check.durationMs)}
            </span>
            {check.url ? <a href={check.url} target="_blank" rel="noreferrer" className="rounded text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-ring">{t("checkDetails")}</a> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

const CHECK_SLICE_STROKE: Record<CheckState, string> = {
  success: "stroke-emerald-500",
  pending: "stroke-amber-500",
  failure: "stroke-red-500",
  neutral: "stroke-muted-foreground",
};

export function ChecksDonut({ parts }: { parts: CheckState[] }) {
  const size = 16;
  const radius = 6.5;
  const stroke = 3;
  const circumference = 2 * Math.PI * radius;
  const slice = circumference / parts.length;
  // Slices run clockwise from 12 o'clock; a small gap keeps adjacent parts
  // readable even when every slice has the same color.
  const gap = parts.length > 1 ? Math.min(1.5, slice * 0.2) : 0;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="size-4 shrink-0"
      aria-hidden
    >
      {parts.map((state, index) => (
        <circle
          key={index}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={CHECK_SLICE_STROKE[state]}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${Math.max(slice - gap, 0)} ${circumference}`}
          strokeDashoffset={-index * slice}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ))}
    </svg>
  );
}

function AvatarCascade({
  users,
}: {
  users: { login: string; avatar_url: string | null }[];
}) {
  return (
    <span className="flex items-center">
      {users.slice(0, 4).map((user, index) => (
        <ForgeUserAvatar
          key={user.login}
          user={user}
          className={cn(
            "size-4 ring-1 ring-insight",
            index > 0 && "-ml-1.5",
          )}
        />
      ))}
    </span>
  );
}
