"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Check,
  CircleDot,
  CircleSlash,
  Eye,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequestArrow,
  GitPullRequestClosed,
  GitPullRequestDraft,
  History,
  Link2,
  Lock,
  LockOpen,
  Milestone,
  SquarePen,
  Tag,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { cn } from "mangue-ui";
import { AuthorNames, AuthorStack } from "@/components/git/author-stack";
import { GitLogin } from "@/components/git/git-login";
import { Markdown } from "@/components/markdown";
import { PrHunk } from "@/components/pull-requests/pr-hunk";
import { UserAvatar } from "@/components/user-avatar";
import { displayLineOf } from "@/lib/pr-review-threads";
import { normalizeForgeInstant } from "@/lib/forge-time";
import type { PrTimelineEvent, PrReviewState } from "@/lib/pr-timeline";
import type { PullRequestReviewComment } from "@/lib/agent-api";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * PR ACTIVITY in the conversation thread (MIN-159) — what happened
 * between two messages, and which minddy was entirely missing: a reasoned approval
 * was nowhere visible, nor was a push, a renaming or a
 * switch to draft.
 *
 * Two forms, like at GitHub, and the gap between them is what makes the thread
 * readable:
 * - a **review** is a MESSAGE (verdict + body + the points placed on the
 * code): it takes a card, at the same template as the comments ;
 * - everything else is a **line**: a sticker, a noun, a verb, a time.
 * Stacking them into cards would drown out the three messages that matter.
 */

/** Tag of every fact — the same visual grammar as GitHub. */
const KIND_ICON: Record<PrTimelineEvent["kind"], typeof Check> = {
  reviewed: Eye,
  review_dismissed: CircleSlash,
  review_requested: Eye,
  review_request_removed: Eye,
  committed: GitCommitHorizontal,
  force_pushed: Upload,
  branch_deleted: Trash2,
  branch_restored: GitBranch,
  labeled: Tag,
  unlabeled: Tag,
  assigned: UserPlus,
  unassigned: UserMinus,
  renamed: SquarePen,
  milestoned: Milestone,
  demilestoned: Milestone,
  ready_for_review: GitPullRequestArrow,
  converted_to_draft: GitPullRequestDraft,
  merged: GitMerge,
  closed: GitPullRequestClosed,
  reopened: CircleDot,
  referenced: Link2,
  cross_referenced: Link2,
  locked: Lock,
  unlocked: LockOpen,
  auto_merge_enabled: Zap,
  auto_merge_disabled: Zap,
  system: History,
};

/** The verb of each fact. Placeholder keys are called with their values. */
const KIND_MESSAGE: Record<
  Exclude<PrTimelineEvent["kind"], "reviewed" | "system">,
  MessageKey<"PullRequests">
> = {
  review_dismissed: "timelineReviewDismissed",
  review_requested: "timelineReviewRequested",
  review_request_removed: "timelineReviewRequestRemoved",
  committed: "timelineCommitted",
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
 * One fact, in one line. The name of the author opens the sentence, as on GitHub —
 * it is him who we scan going down the thread.
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
  // then keeps the icon and the color of its verdict, the only carriers of meaning.
  const verdict = event.kind === "reviewed" ? REVIEW_STATE[event.reviewState ?? "commented"] : null;
  const Icon = verdict?.icon ?? KIND_ICON[event.kind] ?? History;
  // `actors` is only filled on commits: everywhere else a fact has a
  // sole author, and the stack falls back to the original rendering.
  const authors = event.actors ?? [];

  return (
    // `items-start` + imposed line height: the pad fits on the
    // FIRST line of the text, and no longer floats there — it is exactly the height
    // of a `text-sm` line (20 px), so no offset to correct. Center on
    // the whole block would move it down as soon as a sentence passes the line.
    <li className="flex items-start gap-2.5 px-1 py-0.5 text-sm leading-5 text-muted-foreground">
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/80",
          verdict?.className,
        )}
        aria-hidden
      >
        <Icon className="size-3" />
      </span>
      {/* Authors in the plural when the fact has several — a co-signed commit
, a multi-handed push. Otherwise the actor alone, which
 returns exactly the avatar from before. */}
      {authors.length > 0 ? (
        // 16 px centered in the 20 px line: the same setting as the pad.
        <AuthorStack authors={authors} size="size-4" className="mt-0.5" />
      ) : event.actor ? (
        <UserAvatar
          url={event.actor.avatar_url}
          seed={event.actor.login}
          className="mt-0.5 size-4 shrink-0"
        />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {authors.length > 0 ? (
          <AuthorNames authors={authors} className="text-sm" />
        ) : event.actor ? (
          <GitLogin login={event.actor.login} className="font-medium text-foreground" />
        ) : null}
        <span className={cn("min-w-0", verdict?.className)}>{timelineText(event, t)}</span>
        {normalizeForgeInstant(event.createdAt, now) ? (
          <span className="shrink-0 text-xs text-muted-foreground/70">
            {format.relativeTime(normalizeForgeInstant(event.createdAt, now) as Date, now)}
          </span>
        ) : null}
      </span>
    </li>
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
      return t("timelineRenamed", { from: event.from ?? "—", to: event.to ?? "—" });
    case "milestoned":
      return t("timelineMilestoned", { name: event.name ?? "—" });
    case "cross_referenced":
      return t("timelineCrossReferenced", { reference: event.reference ?? "—" });
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
  { label: MessageKey<"PullRequests">; icon: typeof Check | null; className: string }
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
 * A review submitted, rendered as a message: the verdict in the header, the body
 * below, and the points placed on the code folded afterward.
 *
 * These points live in the Files tab, on their line — but a review whose thread would ONLY show " requested changes”, without saying which ones,
 * would require you to change tabs to understand what just happened. They are
 * therefore recalled here, in extract, with their anchor: the detail (the hunk, the thread of
 * answers) remains in the diff.
 *
 * A NAKED review - no body, no point - does not deserve a card: it is
 * a fact, and the caller puts it online like the others.
 */
export function PrTimelineReview({
  event,
  comments,
}: {
  event: PrTimelineEvent;
  /** The points of THIS review, already filtered by the caller. */
  comments: PullRequestReviewComment[];
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useNow();
  const state = REVIEW_STATE[event.reviewState ?? "commented"];
  // Absent on “read again”: the map is already made of what the icon announces.
  const Icon = state.icon;

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2">
        <UserAvatar
          url={event.actor?.avatar_url}
          seed={event.actor?.login ?? "?"}
          className="size-5"
        />
        <GitLogin login={event.actor?.login} className="text-sm font-medium text-foreground" />
        <span className={cn("flex shrink-0 items-center gap-1 text-xs", state.className)}>
          {Icon ? <Icon className="size-3.5" /> : null}
          {t(state.label)}
        </span>
        {normalizeForgeInstant(event.createdAt, now) ? (
          <span className="shrink-0 text-xs text-muted-foreground/80">
            {format.relativeTime(normalizeForgeInstant(event.createdAt, now) as Date, now)}
          </span>
        ) : null}
      </div>
      {event.body ? (
        <Markdown className="text-foreground [&_code]:bg-primary/10 [&_code]:text-primary [&_pre_code]:text-inherit">
          {event.body}
        </Markdown>
      ) : null}
      {comments.length > 0 ? (
        <ul className="flex flex-col gap-2 pt-0.5">
          {comments.map((c) => (
            <ReviewCommentBlock key={c.id} comment={c} />
          ))}
        </ul>
      ) : null}
    </li>
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
export function ReviewCommentBlock({ comment }: { comment: PullRequestReviewComment }) {
  const format = useFormatter();
  const now = useNow();

  return (
    <li className="overflow-clip rounded-md border border-border bg-background">
      <PrHunk
        path={comment.path}
        line={displayLineOf(comment)}
        diffHunk={comment.diff_hunk}
        // The block is in `bg-background` (this is what detaches it from the map
        // review): the diff must take this background, not that of a card.
        className="pr-diff-view-inset border-b border-border"
      />

      <div className="flex flex-col gap-1 px-2.5 py-2">
        <span className="flex items-center gap-1.5">
          <UserAvatar
            url={comment.user?.avatar_url}
            seed={comment.user?.login ?? "?"}
            className="size-4"
          />
          <GitLogin login={comment.user?.login} className="text-xs font-medium text-foreground" />
          <span className="shrink-0 text-[11px] text-muted-foreground/70">
            {format.relativeTime(normalizeForgeInstant(comment.created_at, now) ?? now, now)}
          </span>
        </span>
        <Markdown className="text-sm text-foreground">{comment.body}</Markdown>
      </div>
    </li>
  );
}
