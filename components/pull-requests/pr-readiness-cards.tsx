"use client";

/**
 * Status cards of a pull request (MIN-548).
 *
 * Every condition that currently stands between the PR and the merge — plus
 * the checks and deployment stories, including when they succeed — renders as
 * one tinted card, with the same color grammar as the state badges:
 * red = blocked, orange = in progress, green = passed. A card shows an
 * illustration, a title, and when the forge dates it, a duration (ticking
 * while work runs, frozen once it settles).
 *
 * The grid is a bento: same height for every card, wrapping line by line —
 * no carousel, no horizontal scroll. A card never needs the whole width, but
 * may take it.
 *
 * Cards are interactive where a quick fix exists: hover blurs the content and
 * reveals a centered action button ("Update branch", "View deployment"…),
 * while click-through cards (checks, unresolved comments) open the matching
 * surface directly.
 */

import { useMemo, type ReactNode } from "react";
import { useNow, useTranslations } from "next-intl";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Eye,
  GitBranch,
  GitMerge,
  GitPullRequestDraft,
  RotateCcw,
  ShieldAlert,
  UserRoundCheck,
} from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "mangue-ui";

import { CheckLogo } from "@/components/pull-requests/pr-check-logo";
import { NumoIcon } from "@/components/numo-icon";
import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import { AppTooltip } from "@/components/ui/app-tooltip";
import type {
  CheckState,
  ChecksSummary,
  PullRequestCheck,
} from "@/lib/agent-api";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { PullRequestFeedbackThread } from "@/lib/pr-unresolved-conversations";
import type {
  PullRequestReadiness,
  ReadinessAction,
  ReadinessBlocker,
} from "@/lib/pr-readiness";

export type PrStatusCardTone = "danger" | "progress" | "success";

/** The tone grammar, shared by the merge-state control and the state badges. */
const TONE_CARD: Record<PrStatusCardTone, string> = {
  success:
    "border-emerald-600/30 bg-emerald-600/10 dark:border-emerald-400/30",
  progress: "border-amber-600/30 bg-amber-600/10 dark:border-amber-400/30",
  danger: "border-destructive/30 bg-destructive/10",
};

const TONE_TITLE: Record<PrStatusCardTone, string> = {
  success: "text-emerald-700 dark:text-emerald-400",
  progress: "text-amber-700 dark:text-amber-400",
  danger: "text-destructive",
};

/** The hover action button borrows the card's own color codes. */
const TONE_BUTTON: Record<PrStatusCardTone, string> = {
  success:
    "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/15 hover:border-emerald-600/50 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-400 dark:hover:bg-emerald-400/15",
  progress:
    "border-amber-600/40 bg-amber-600/10 text-amber-700 hover:bg-amber-600/15 hover:border-amber-600/50 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-400 dark:hover:bg-amber-400/15",
  danger:
    "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:border-destructive/50 dark:border-destructive/40 dark:bg-destructive/10 dark:hover:bg-destructive/15",
};

/** Alpha background of a check row, tinted by its own state. */
const CHECK_ROW_BG: Record<CheckState, string> = {
  success: "bg-emerald-500/10",
  pending: "bg-amber-500/10",
  failure: "bg-red-500/10",
  neutral: "bg-muted/50",
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

interface PrStatusCard {
  id: string;
  tone: PrStatusCardTone;
  title: string;
  /** Final duration, frozen. `null` = the card carries no time. */
  durationMs: number | null;
  /** Live timer — the duration recomputes on every tick until it settles. */
  startedAt: string | null;
  donutParts: CheckState[] | null;
  avatars: { login: string; avatar_url: string | null }[] | null;
  iconKind: ReadinessBlocker["kind"];
  /** Whole-card click (checks popover, comments panel). */
  onSelect?: () => void;
  /** Hover overlay: blur the content, reveal one action button. */
  action?: {
    label: string;
    onClick: () => void;
    testId?: string;
    disabled?: boolean;
  };
}

/** The Numo review gesture, as its own card (MIN-548): running, already
    done, or waiting to be asked. `requested` carries the action. */
export interface PrNumoReviewCardSpec {
  kind: "running" | "current" | "requested";
  label: string;
  /** The session, when one exists — the whole card opens it. */
  href: string | null;
  /** Live clock of a running review. */
  startedAt: string | null;
  /** Settled duration of the completed pass. */
  durationMs: number | null;
}

interface PrStatusCardsProps {
  readiness: PullRequestReadiness | null;
  checks: ChecksSummary | null;
  provider: RepoProviderId;
  deploymentUrl: string | null;
  /** Time the successful deployment took to settle, when the forge dates it. */
  deploymentDurationMs: number | null;
  unresolvedThreads: PullRequestFeedbackThread[];
  canAct: (blocker: ReadinessBlocker) => boolean;
  acting: ReadinessAction | null;
  onAction: (blocker: ReadinessBlocker) => void;
  onOpenConversations: () => void;
  onOpenReviewApprove: () => void;
  onStartFileReview: () => void;
  onRerunCheck: (check: PullRequestCheck) => void;
  numoReview: PrNumoReviewCardSpec | null;
  onRequestReview: () => void;
}

export function PrStatusCards(props: PrStatusCardsProps) {
  const t = useTranslations("PullRequests");
  const now = useNow({ updateInterval: 1_000 });
  const cards = useMemo(
    () => buildStatusCards(t, props),
    // `now` only drives the ticking durations, not the card set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.readiness,
      props.checks,
      props.deploymentUrl,
      props.unresolvedThreads,
      props.acting,
      props.numoReview,
    ],
  );
  if (cards.length === 0) return null;

  return (
    /* Bento of cards: each one hugs its title so the title always fits on
       one line, wrapping to the next row when the row is full. No carousel,
       no horizontal scroll; the available width is the only cap a card can
       hit (the title then clips instead of overflowing). */
    <div
      data-testid="pr-status-cards"
      className="flex max-w-full flex-wrap items-stretch gap-2"
    >
      {cards.map(({ card, checksCard }) => (
        <PrStatusCardView
          key={card.id}
          card={card}
          now={now}
          checks={checksCard ? props.checks : null}
          provider={props.provider}
          onRerunCheck={props.onRerunCheck}
        />
      ))}
    </div>
  );
}

function pushCheck(
  cards: { card: PrStatusCard; checksCard: boolean }[],
  card: PrStatusCard,
) {
  cards.push({ card, checksCard: true });
}

function buildStatusCards(
  t: ReturnType<typeof useTranslations<"PullRequests">>,
  props: PrStatusCardsProps,
): { card: PrStatusCard; checksCard: boolean }[] {
  const cards: { card: PrStatusCard; checksCard: boolean }[] = [];
  const { readiness, checks, deploymentUrl, unresolvedThreads } = props;
  const blockers = readiness?.blockers ?? [];
  const push = (card: PrStatusCard, checksCard = false) =>
    cards.push({ card, checksCard });
  const blockerAction = (blocker: ReadinessBlocker) => () => {
    props.onAction(blocker);
  };
  const busy = props.acting !== null;

  // ── Checks ──────────────────────────────────────────────────────────────
  // The checks tell one story in three readings: still running (orange),
  // failed (red), all passed (green). The donut shows every check as one
  // slice, colored by its own state; only the passed reading replaces it
  // with the plain checkmark. The timer ticks while anything runs.
  if (checks && checks.total > 0) {
    const states = checks.checks.map((check) => check.state);
    const pending = states.filter((state) => state === "pending").length;
    const failed = states.filter((state) => state === "failure").length;
    const durationMs =
      checks.startedAt && checks.completedAt
        ? Date.parse(checks.completedAt) - Date.parse(checks.startedAt)
        : null;
    if (pending > 0) {
      pushCheck(cards, {
        id: "checks-running",
        tone: "progress",
        title: t("cardChecksRunning", { count: pending }),
        donutParts: states,
        startedAt: checks.startedAt,
        durationMs: null,
        avatars: null,
        iconKind: "checks",
      });
    } else if (failed > 0) {
      pushCheck(cards, {
        id: "checks-failed",
        tone: "danger",
        title: t("cardChecksFailed", { count: failed }),
        donutParts: states,
        startedAt: checks.startedAt,
        durationMs,
        avatars: null,
        iconKind: "checks",
      });
    } else {
      pushCheck(cards, {
        id: "checks-passed",
        tone: "success",
        title: t("cardChecksPassed", { count: checks.total }),
        donutParts: null,
        startedAt: null,
        durationMs,
        avatars: null,
        iconKind: "checks",
      });
    }
  }

  // ── Deployment ──────────────────────────────────────────────────────────
  // The forge only reports the latest successful deployment URL: a green
  // card with the open gesture, never a fake "in progress" it cannot back.
  if (deploymentUrl) {
    push({
      id: "deployment",
      tone: "success",
      title: t("cardDeploymentPassed"),
      durationMs: props.deploymentDurationMs,
      startedAt: null,
      donutParts: null,
      avatars: null,
      iconKind: "mergeability",
      action: {
        label: t("viewDeployment"),
        onClick: () => window.open(deploymentUrl, "_blank", "noreferrer"),
        testId: "pr-card-view-deployment",
      },
    });
  }

  // ── Numo review ─────────────────────────────────────────────────────────
  // One card for ONE gesture (have Numo proofread), whatever its phase:
  // running (orange, ticking), up to date (green, opens the session), or
  // waiting for the ask (orange, the action takes the card on hover). It
  // takes the gesture out of the header more menu (MIN-548).
  const numoReview = props.numoReview;
  if (numoReview) {
    if (numoReview.kind === "requested") {
      push({
        id: "numo-review",
        tone: "progress",
        title: numoReview.label,
        durationMs: null,
        startedAt: null,
        donutParts: null,
        avatars: null,
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
        avatars: null,
        iconKind: "mergeability",
        onSelect: numoReview.href
          ? () => window.open(numoReview.href as string, "_self")
          : undefined,
      });
    }
  }

  // ── Blockers ────────────────────────────────────────────────────────────
  for (const blocker of blockers) {
    // The checks story is the card above; readiness rows would repeat it.
    if (blocker.kind === "checks") continue;
    const tone: PrStatusCardTone =
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
          avatars: null,
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
          avatars: null,
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
          avatars: null,
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
          avatars: null,
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
      case "conversations": {
        const authors = unresolvedThreads
          .map((thread) => thread.root.user)
          .filter(
            (user): user is { login: string; avatar_url: string | null } =>
              !!user,
          );
        const unique = authors.filter(
          (user, index) =>
            authors.findIndex((other) => other.login === user.login) === index,
        );
        push({
          id: blocker.id,
          tone,
          title: t("cardUnresolvedComments", { count: blocker.count ?? 0 }),
          durationMs: null,
          startedAt: null,
          donutParts: null,
          avatars: unique.slice(0, 4),
          iconKind: blocker.kind,
          onSelect: props.onOpenConversations,
        });
        break;
      }
      case "branch":
        push({
          id: blocker.id,
          tone,
          title: t("readinessBranchOutOfDate"),
          durationMs: null,
          startedAt: null,
          donutParts: null,
          avatars: null,
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
          avatars: null,
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
          avatars: null,
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
          avatars: null,
          iconKind: blocker.kind,
        });
        break;
    }
  }

  return cards;
}

function blockerIcon(kind: ReadinessBlocker["kind"]) {
  switch (kind) {
    case "draft":
      return <GitPullRequestDraft />;
    case "review_requested":
      return <Eye />;
    case "changes_requested":
      return <CircleAlert />;
    case "approvals":
      return <UserRoundCheck />;
    case "branch":
      return <GitBranch />;
    case "conflicts":
      return <GitMerge />;
    case "policy":
      return <ShieldAlert />;
    case "mergeability":
    case "checks":
      return <CircleAlert />;
  }
}

function PrStatusCardView({
  card,
  now,
  checks,
  provider,
  onRerunCheck,
}: {
  card: PrStatusCard;
  now: Date;
  checks: ChecksSummary | null;
  provider: RepoProviderId;
  onRerunCheck: (check: PullRequestCheck) => void;
}) {
  const t = useTranslations("PullRequests");
  const body = (
    <>
      {/* Illustration: donut for a mixed checks story, avatars for the
          reviewers waiting, bare icon otherwise — no container behind it. */}
      <span
        className={cn(
          "flex items-center [&_svg]:size-5",
          TONE_TITLE[card.tone],
        )}
      >
        {card.donutParts ? (
          <ChecksDonut parts={card.donutParts} />
        ) : card.avatars ? (
          <AvatarCascade users={card.avatars} />
        ) : card.id === "checks-passed" ? (
          <Check />
        ) : card.id === "deployment" ? (
          <ArrowUpRight />
        ) : card.id === "numo-review" ? (
          <NumoIcon animated={false} />
        ) : (
          blockerIcon(card.iconKind)
        )}
      </span>
      {/* Title and timer read together, in the same voice: the time is part
          of what the card says, not metadata. */}
      <p
        className={cn(
          "mt-auto flex items-baseline gap-1.5 text-[13px] font-medium leading-4",
          TONE_TITLE[card.tone],
        )}
      >
        {/* The title always breathes: a mandatory gap follows it, before the
            timer or the card edge — the card never hugs the text. */}
        <span className="min-w-0 truncate pr-6">{card.title}</span>
        {card.startedAt
          ? formatRunDuration(
              t,
              Math.max(now.getTime() - Date.parse(card.startedAt), 0),
            )
          : formatRunDuration(t, card.durationMs)}
      </p>
    </>
  );

  const inner = (
    <div className="flex h-24 min-w-0 flex-col gap-2.5 p-3">
      {card.action ? (
        // Hover reveals the quick fix: the card content blurs away and one
        // button takes the center.
        <div className="group relative flex h-full min-w-0 flex-col">
          <div className="pointer-events-none flex h-full min-w-0 flex-col gap-2.5 transition duration-150 group-hover:opacity-0 group-hover:blur-[2px]">
            {body}
          </div>
          <div className="absolute inset-0 grid place-items-center opacity-0 transition duration-150 group-hover:opacity-100">
            <Button
              data-testid={card.action.testId}
              size="sm"
              variant="outline"
              disabled={card.action.disabled}
              className={cn("max-w-full truncate px-3", TONE_BUTTON[card.tone])}
              onClick={card.action.onClick}
            >
              {card.action.label}
            </Button>
          </div>
        </div>
      ) : (
        body
      )}
    </div>
  );

  // The checks card is a popover trigger; the other click-through cards are
  // plain buttons. Action cards stop at their hover button.
  if (checks) {
    return (
      <ChecksPopoverCard
        checks={checks}
        provider={provider}
        onRerunCheck={onRerunCheck}
        tone={card.tone}
      >
        {inner}
      </ChecksPopoverCard>
    );
  }

  return (
    <div
      role={card.onSelect ? "button" : undefined}
      tabIndex={card.onSelect ? 0 : undefined}
      onClick={card.onSelect}
      onKeyDown={
        card.onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                card.onSelect?.();
              }
            }
          : undefined
      }
      data-testid={`pr-status-card-${card.id}`}
      className={cn(
        "max-w-full rounded-xl border text-left",
        TONE_CARD[card.tone],
        card.onSelect &&
          "cursor-pointer outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {inner}
    </div>
  );
}

function ChecksPopoverCard({
  checks,
  provider,
  onRerunCheck,
  tone,
  children,
}: {
  checks: ChecksSummary;
  provider: RepoProviderId;
  onRerunCheck: (check: PullRequestCheck) => void;
  tone: PrStatusCardTone;
  children: ReactNode;
}) {
  const t = useTranslations("PullRequests");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          data-testid="pr-status-card-checks"
          role="button"
          tabIndex={0}
          className={cn(
            "max-w-full cursor-pointer rounded-xl border outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring",
            TONE_CARD[tone],
          )}
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        data-testid="pr-checks-popover"
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] p-2"
      >
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {checks.checks.map((check) => (
            <li
              key={`${check.appName ?? provider}-${check.name}`}
              data-testid="pr-check-row"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5",
                CHECK_ROW_BG[check.state],
              )}
            >
              <CheckLogo
                url={check.appAvatarUrl}
                provider={provider}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-4">
                  {check.name}
                </p>
                {check.description ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {check.description}
                  </p>
                ) : null}
              </div>
              {check.durationMs != null ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatRunDuration(t, check.durationMs)}
                </span>
              ) : null}
              {check.state === "failure" && check.rerunRef ? (
                <AppTooltip label={t("blockerActionRerun")}>
                  <Button
                    data-testid="pr-check-rerun"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0"
                    aria-label={t("blockerActionRerun")}
                    onClick={() => onRerunCheck(check)}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </AppTooltip>
              ) : null}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

const CHECK_SLICE_STROKE: Record<CheckState, string> = {
  success: "stroke-emerald-500",
  pending: "stroke-amber-500",
  failure: "stroke-red-500",
  neutral: "stroke-muted-foreground",
};

function ChecksDonut({ parts }: { parts: CheckState[] }) {
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
      {parts.slice(0, 12).map((state, index) => (
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
            "size-4 ring-1 ring-card",
            index > 0 && "-ml-1.5",
          )}
        />
      ))}
    </span>
  );
}
