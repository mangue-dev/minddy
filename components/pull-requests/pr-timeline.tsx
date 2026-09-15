"use client";

import { useEffect, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Check, CircleSlash, X } from "lucide-react";
import { cn } from "mangue-ui";
import { AuthorNames, AuthorStack } from "@/components/git/author-stack";
import { GitLogin } from "@/components/git/git-login";
import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import { Markdown } from "@/components/markdown";
import { PrHunk } from "@/components/pull-requests/pr-hunk";
import {
  ReviewThreadCard,
  useReviewReplies,
  useThreadResolution,
} from "@/components/pull-requests/pr-review-comments";
import {
  displayLineOf,
  displayStartLineOf,
  groupReviewThreads,
  type ReviewThreadState,
} from "@/lib/pr-review-threads";
import { normalizeForgeInstant } from "@/lib/forge-time";
import type { PrTimelineEvent, PrReviewState } from "@/lib/pr-timeline";
import type { PrEndpoint, PullRequestReviewComment } from "@/lib/agent-api";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * PR ACTIVITY in the conversation thread (MIN-159, MIN-548) — what happened
 * between two messages, and which minddy was entirely missing: a reasoned approval
 * was nowhere visible, nor was a push, a renaming or a
 * switch to draft.
 *
 * Two forms, like at GitHub, and the gap between them is what makes the thread
 * readable:
 * - a **review** is a MESSAGE (verdict + body + the points placed on the
 *   code): it takes a self-contained card, at the same template as the comments;
 * - everything else is a **line**: an avatar, a noun, a verb, a time.
 *   Stacking them into cards would drown out the three messages that matter.
 */

/**
 * The verb of each fact. Placeholder keys are called with their values.
 */
const KIND_MESSAGE: Record<
  Exclude<PrTimelineEvent["kind"], "reviewed" | "system">,
  MessageKey<"PullRequests">
> = {
  review_dismissed: "timelineReviewDismissed",
  review_requested: "timelineReviewRequested",
  review_request_removed: "timelineReviewRequestRemoved",
  committed: "timelineCommitted",
  deployed: "timelineDeployed",
  deployment_environment_changed: "timelineDeploymentEnvironmentChanged",
  force_pushed: "timelineForcePushed",
  branch_deleted: "timelineBranchDeleted",
  branch_restored: "timelineBranchRestored",
  labeled: "timelineLabeled",
  unlabeled: "timelineUnlabeled",
  assigned: "timelineAssigned",
  unassigned: "timelineUnassigned",
  renamed: "timelineRenamed",
  milestoned: "timelineMilestoned",
  demilestoned: "timelineDemilestoned",
  ready_for_review: "timelineReadyForReview",
  converted_to_draft: "timelineConvertedToDraft",
  merged: "timelineMerged",
  closed: "timelineClosed",
  reopened: "timelineReopened",
  referenced: "timelineReferenced",
  cross_referenced: "timelineCrossReferenced",
  locked: "timelineLocked",
  unlocked: "timelineUnlocked",
  auto_merge_enabled: "timelineAutoMergeEnabled",
  auto_merge_disabled: "timelineAutoMergeDisabled",
};

/**
 * One fact, in one line: the avatar of the actor, the sentence, and the time
 * at the far right. No leading icon — the avatar already says WHO, and the
 * sentence says WHAT; a sticker in front of both only repeated them.
 *
 * The case `system` is the GitLab fallback: a sentence that minddy did not know how to translate
 * in his vocabulary, rendered as GitLab wrote it. A fact said in
 * English remains a fact said; silence would be the only real fault.
 */
export function PrTimelineRow({ event }: { event: PrTimelineEvent }) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useNow();
  // A NUE review — approved without a word — arrives here rather than on the map: it
  // then keeps the color of its verdict, the only carrier of meaning.
  const verdict =
    event.kind === "reviewed"
      ? REVIEW_STATE[event.reviewState ?? "commented"]
      : null;
  // `actors` is only filled on commits: everywhere else a fact has a
  // sole author, and the stack falls back to the original rendering.
  const authors = event.actors ?? [];
  const when = normalizeForgeInstant(event.createdAt, now);

  return (
    <div
      data-testid="pr-timeline-event"
      data-kind={event.kind}
      className="flex min-w-0 items-start gap-2 text-sm leading-5 text-muted-foreground"
    >
      {authors.length > 0 ? (
        <AuthorStack authors={authors} size="size-4" className="mt-0.5" />
      ) : event.actor ? (
        <ForgeUserAvatar
          user={event.actor}
          className="mt-0.5 size-4 shrink-0"
        />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {authors.length > 0 ? (
          <AuthorNames authors={authors} className="text-sm" />
        ) : event.actor ? (
          <GitLogin login={event.actor.login} className="font-medium text-foreground" />
        ) : null}
        <span className={cn("min-w-0", verdict?.className)}>
          {timelineText(event, t)}
        </span>
        {event.kind === "committed" && event.body ? (
          <span className="min-w-0 truncate font-medium text-foreground">
            {event.body}
          </span>
        ) : null}
        {/* The SHA stays, as a compact chip: it is the only handle a commit
            row offers once the diff lives behind the click on the row. */}
        {event.kind === "committed" && event.sha ? (
          event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground hover:text-brand"
            >
              {event.sha.slice(0, 7)}
            </a>
          ) : (
            <code className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              {event.sha.slice(0, 7)}
            </code>
          )
        ) : null}
      </span>
      {when ? (
        <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground/70">
          {format.relativeTime(when, now)}
        </span>
      ) : null}
    </div>
  );
}

/** The text of the fact, including placeholder values ​​(the i18n contract). */
function timelineText(
  event: PrTimelineEvent,
  t: ReturnType<typeof useTranslations<"PullRequests">>,
): string {
  switch (event.kind) {
    // A sentence from GitLab that no pattern recognizes: it is rendered as
    // what, this is the only information we have.
    case "system":
      return event.body ?? "";
    case "committed":
      return t("timelineCommitted", { count: event.commitCount ?? 1 });
    case "labeled":
    case "unlabeled":
      return t(KIND_MESSAGE[event.kind], { label: event.label?.name ?? "—" });
    case "assigned":
    case "unassigned":
    case "review_requested":
    case "review_request_removed":
      return t(KIND_MESSAGE[event.kind], { login: event.subject ?? "—" });
    case "renamed":
      return t("timelineRenamed", {
        from: event.from ?? "—",
        to: event.to ?? "—",
      });
    case "milestoned":
      return t("timelineMilestoned", { name: event.name ?? "—" });
    case "cross_referenced":
      return t("timelineCrossReferenced", {
        reference: event.reference ?? "—",
      });
    // A review that lands ONLINE has neither body nor point: its verdict is
    // everything she says, and it's the same word as on her card.
    case "reviewed":
      return t(REVIEW_STATE[event.reviewState ?? "commented"].label);
    default:
      return t(KIND_MESSAGE[event.kind]);
  }
}

/**
 * Verdict → word and color. The same as the state of the PR: it is a standard.
 *
 * `icon: null` on “reread”, and this is deliberate: this verdict does not DECIDE anything —
 * its content is just below, in the card. A comment bubble
 * in front of a block which is only made up of comments says nothing more, and the
 * noise is paid for by the two verdicts which count.
 */
const REVIEW_STATE: Record<
  PrReviewState,
  {
    label: MessageKey<"PullRequests">;
    icon: typeof Check | null;
    className: string;
  }
> = {
  approved: {
    label: "timelineReviewApproved",
    icon: Check,
    className: "text-emerald-600 dark:text-emerald-500",
  },
  changes_requested: {
    label: "timelineReviewChangesRequested",
    icon: X,
    className: "text-destructive",
  },
  commented: {
    label: "timelineReviewCommented",
    icon: null,
    className: "text-muted-foreground",
  },
  dismissed: {
    label: "timelineReviewDismissedState",
    icon: CircleSlash,
    className: "text-muted-foreground",
  },
};

/**
 * A submitted review with its body and code threads attached to one branch.
 * Bare reviews remain compact timeline events and never create an empty card.
 */
export function PrTimelineReview({
  event,
  comments,
  endpoint,
  threadStates,
  canComment,
  canResolve,
  onChanged,
  onResolutionChanged = onChanged,
}: {
  event: PrTimelineEvent;
  /** The points of THIS review, already filtered by the caller. */
  comments: PullRequestReviewComment[];
  endpoint: PrEndpoint;
  threadStates: ReviewThreadState[];
  canComment: boolean;
  canResolve: boolean;
  onChanged: () => unknown;
  /** Refresh merge readiness without replacing the activity thread. */
  onResolutionChanged?: () => unknown;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useNow();
  const state = REVIEW_STATE[event.reviewState ?? "commented"];
  const threads = groupReviewThreads(comments, threadStates);
  const replies = useReviewReplies(endpoint, onChanged);
  const resolution = useThreadResolution(endpoint, onResolutionChanged);
  // Absent on “read again”: the map is already made of what the icon announces.
  const Icon = state.icon;
  const when = normalizeForgeInstant(event.createdAt, now);

  return (
    <div className="flex flex-col gap-3">
      <article
        data-testid="pr-activity-review"
        className="overflow-clip rounded-lg border border-border bg-card shadow-xs"
      >
        <div className="px-3.5 py-3">
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ForgeUserAvatar user={event.actor} className="size-5 shrink-0" />
            <GitLogin
              login={event.actor?.login}
              className="text-sm font-medium text-foreground"
            />
            <span className={cn("flex shrink-0 items-center gap-1 text-xs", state.className)}>
              {Icon ? <Icon className="size-3.5" /> : null}
              {t(state.label)}
            </span>
            {when ? (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground/80">
                {format.relativeTime(when, now)}
              </span>
            ) : null}
          </header>
          {event.body ? (
            <div className="mt-2.5">
              <Markdown
                allowRawHtml
                linkVariant="plain"
                className="text-foreground [&_code]:bg-primary/10 [&_code]:text-primary [&_pre_code]:text-inherit"
              >
                {event.body}
              </Markdown>
            </div>
          ) : null}
        </div>
      </article>
      {comments.length > 0 ? (
        <ul
          data-testid="pr-activity-review-threads"
          className="ml-3 flex flex-col gap-3 border-l border-border pl-4"
        >
          {threads.map((thread) => (
            <ReviewCommentBlock
              key={thread.id}
              thread={thread}
              replies={replies}
              resolution={canResolve ? resolution : undefined}
              readOnly={!canComment}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A review point, rendered as GitHub renders it in the thread: the file, the
 * CODE it's talking about, then the comment itself.
 *
 * The three parts are in this order for a reason. The path locates, the code
 * shows what we're talking about — a line comment without its extract is a
 * sentence without a subject, and that's exactly what made these blocks unreadable — and
 * the clear separation (background, border, avatar) says that what follows is someone
 * speaking, not a continuation of the diff.
 *
 * The first two parts are `PrHunk`, that is to say the rendering of the tab
 * Files: the same code, in the same page, cannot have two appearances
 * depending on the tab from which it is viewed. Without a hunk (GitLab does not use any),
 * the extract disappears and the anchor `fichier:ligne` alone carries the context: the
 * block is still read.
 */
export function ReviewCommentBlock({
  thread,
  replies,
  resolution,
  readOnly,
}: {
  thread: ReturnType<
    typeof groupReviewThreads<PullRequestReviewComment>
  >[number];
  replies: ReturnType<typeof useReviewReplies>;
  resolution?: ReturnType<typeof useThreadResolution>;
  readOnly: boolean;
}) {
  return (
    <li className="relative">
      <span aria-hidden className="absolute -left-4 top-4 w-4 border-t border-border" />
      <ReviewConversationCard
        thread={thread}
        replies={replies}
        resolution={resolution}
        readOnly={readOnly}
      />
    </li>
  );
}

/** Full code-and-message surface shared by Activity and unresolved conversations. */
export function ReviewConversationCard({
  thread,
  replies,
  resolution,
  readOnly,
}: {
  thread: ReturnType<
    typeof groupReviewThreads<PullRequestReviewComment>
  >[number];
  replies: ReturnType<typeof useReviewReplies>;
  resolution?: ReturnType<typeof useThreadResolution>;
  readOnly: boolean;
}) {
  const comment = thread.root;
  const resolved = !!thread.resolution?.resolved;
  const [collapsed, setCollapsed] = useState(resolved);

  useEffect(() => {
    setCollapsed(resolved);
  }, [resolved]);

  return (
    <article className="overflow-clip rounded-xl border border-border bg-card shadow-xs">
      <PrHunk
        path={comment.path}
        line={displayLineOf(comment)}
        startLine={displayStartLineOf(comment)}
        side={comment.start_side ?? comment.side}
        outdated={thread.resolution?.outdated ?? comment.line == null}
        resolved={thread.resolution?.resolved}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        diffHunk={comment.diff_hunk}
        className={cn("pr-diff-view-inset bg-muted/15", !collapsed && "border-b border-border")}
        headerClassName="py-2.5"
      />

      {collapsed ? null : (
        <div className="px-3 py-3">
          <ReviewThreadCard
            thread={thread}
            replies={replies}
            resolution={resolution}
            readOnly={readOnly}
            variant="plain"
          />
        </div>
      )}
    </article>
  );
}
