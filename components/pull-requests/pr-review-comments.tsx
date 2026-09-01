"use client";

import { useCallback, useMemo, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CornerDownRight,
  SmilePlus,
} from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import { PrCommentComposer } from "@/components/pull-requests/pr-comment-composer";
import { PrHunk } from "@/components/pull-requests/pr-hunk";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";
import { GitLogin } from "@/components/git/git-login";
import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import { Markdown } from "@/components/markdown";
import {
  replyPrReviewCommentApi,
  setPrCommentReactionApi,
  setPrReviewCommentReactionApi,
  setPrReviewThreadResolvedApi,
  type PrEndpoint,
  type PullRequestReviewComment,
} from "@/lib/agent-api";
import { usePrEndpoint, usePrReplyingUser } from "@/lib/pr-endpoint-context";
import { displayLineOf } from "@/lib/pr-review-threads";
import {
  groupReactionsByComment,
  REVIEW_REACTIONS,
  REVIEW_REACTION_EMOJI,
  type ReviewCommentReaction,
  type ReviewReactionContent,
} from "@/lib/pr-review-reactions";
import type { MessageKey } from "@/lib/i18n-keys";
import type { PrReviewThread } from "@/lib/pr-diff-anchors";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Bricks for displaying PR review comments: the thread anchored under a
 * line (annotation of `@pierre/diffs`), compose it with a new comment, and
 * the folding of expired threads. The placement lives in `pr-diff`.
 */

/**
 * Status of responses to a review thread. Shared by file view and fallback
 * orphan sons — same rules on both sides: a single dial open to the
 * times, but a draft PER thread (changing thread, or missing a sending, does not cost
 * never the text).
 */
export function useReviewReplies(endpoint: PrEndpoint, onPosted: () => unknown) {
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [postingId, setPostingId] = useState<number | null>(null);

  const submit = useCallback(
    async (threadId: number) => {
      const body = (drafts[threadId] ?? "").trim();
      if (!body || postingId != null) return;
      setPostingId(threadId);
      try {
        // Any thread id is fine: GitHub attaches to the root.
        await replyPrReviewCommentApi(endpoint, { body, inReplyTo: threadId });
        setReplyingId(null);
        setDrafts(({ [threadId]: _cleared, ...rest }) => rest);
        await onPosted();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setPostingId(null);
      }
    },
    [drafts, postingId, endpoint, onPosted],
  );

  return {
    replyingId,
    postingId,
    valueFor: (threadId: number) => drafts[threadId] ?? "",
    /** A TRANSFORMATION, not a value: two attachments that land
        in the same round must be added one after the other, each at the
        current draft — passing a captured string to rendering would lose the
        first. */
    change: (threadId: number, transform: (draft: string) => string) =>
      setDrafts((prev) => ({ ...prev, [threadId]: transform(prev[threadId] ?? "") })),
    start: (threadId: number) => setReplyingId(threadId),
    cancel: () => setReplyingId(null),
    submit,
  };
}

export type ReviewReplies = ReturnType<typeof useReviewReplies>;

/**
 * Toggle “resolved/reopened” of a thread (MIN-139). Only one thread flying at a time,
 * like the answers: the list reloads afterwards, two simultaneous toggles
 * would overlap one another.
 */
export function useThreadResolution(endpoint: PrEndpoint, onChanged: () => unknown) {
  const [pendingId, setPendingId] = useState<number | null>(null);

  const toggle = useCallback(
    async (thread: PrReviewThread) => {
      const state = thread.resolution;
      // Without a known state there is no thread id to give to the forge — the caller
      // does not return the button in this case.
      if (!state || pendingId != null) return;
      setPendingId(thread.id);
      try {
        await setPrReviewThreadResolvedApi(endpoint, {
          threadId: state.threadId,
          resolved: !state.resolved,
        });
        await onChanged();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setPendingId(null);
      }
    },
    [endpoint, onChanged, pendingId],
  );

  return { pendingId, toggle };
}

export type ThreadResolution = ReturnType<typeof useThreadResolution>;

/**
 * Emoji reactions of PR comments (MIN-139, expanded by MIN-147): the
 * table indexed by comment, the desired state to ask, and the thread in flight.
 *
 * `canReact` separates READ from ASK — a read-only view displays the
 * reactions of others without offering any: hiding them would make one believe that there are none
 * not.
 *
 * The flip-flop sends the DESIRED STATE (`!mine`), not a “reverse what you have”:
 * it is the server which decides, and a referral after a network failure does not undo
 * then not what had resulted.
 *
 * `surface` says on WHICH family of comments we react — both have the
 * same form and the same gestures, but not the same route: at GitHub, the
 * comments anchored to the code and those in the thread do not live in the same place. THE
 * rest (grouping, chips, palette) is strictly common, and this is what
 * makes react behave the same everywhere.
 */
export function useCommentReactions(
  endpoint: PrEndpoint,
  onChanged: () => unknown,
  reactions: ReviewCommentReaction[],
  canReact: boolean,
  surface: "review" | "conversation" = "review",
) {
  const [pending, setPending] = useState<string | null>(null);
  const byComment = useMemo(() => groupReactionsByComment(reactions), [reactions]);

  const toggle = useCallback(
    async (commentId: number, content: ReviewReactionContent, on: boolean) => {
      if (pending) return;
      setPending(`${commentId}:${content}`);
      try {
        const post =
          surface === "review" ? setPrReviewCommentReactionApi : setPrCommentReactionApi;
        await post(endpoint, { commentId, content, on });
        await onChanged();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setPending(null);
      }
    },
    [endpoint, onChanged, pending, surface],
  );

  return { byComment, pending, canReact, toggle };
}

export type CommentReactions = ReturnType<typeof useCommentReactions>;

/** Label key of each reaction — typed, otherwise `t()` no longer checks anything. */
const REACTION_LABELS: Record<ReviewReactionContent, MessageKey<"PullRequests">> = {
  "+1": "reactionThumbsUp",
  "-1": "reactionThumbsDown",
  laugh: "reactionLaugh",
  hooray: "reactionHooray",
  confused: "reactionConfused",
  heart: "reactionHeart",
  rocket: "reactionRocket",
  eyes: "reactionEyes",
};

/**
 * The gesture “changes this reaction”, shared by the two places hence the
 * palette opens: the DESIRED state is deduced from what is already placed, never from a
 * « inverse ce que tu as » — cf. `useCommentReactions`.
 */
export function reactionToggler(
  reactions: CommentReactions,
  commentId: number,
  list: ReviewCommentReaction[],
) {
  return (content: ReviewReactionContent) =>
    void reactions.toggle(
      commentId,
      content,
      !list.find((r) => r.content === content)?.mine,
    );
}

/**
 * The reaction band of a comment: the emoji already posted with their account,
 * then the button that adds — EVERYTHING related to reactions in the same place,
 * in the same line.
 *
 * This line ONLY exists if the comment already has a reaction: otherwise, the
 * palette remains in the header, revealed on hover (the caller does this sharing).
 * An empty strip under each post would cost all comments their height
 * of all the PRs to show only one button — this is also, exactly, what
 * GitHub does.
 *
 * A chip on = “I reacted” (MIN-145): the reaction comes from the git account
 * of the person on both forges, and the server only lights it for them.
 * Without a connected git account, no chip is turned on — the counters are
 * remain correct: they say what others have said.
 */
export function CommentReactionChips({
  commentId,
  reactions,
  list,
}: {
  commentId: number;
  reactions: CommentReactions;
  list: ReviewCommentReaction[];
}) {
  const t = useTranslations("PullRequests");

  return (
    <div className="flex flex-wrap items-center gap-1">
      {list.map((reaction) => {
        const busy = reactions.pending === `${commentId}:${reaction.content}`;
        // `aria-disabled` and not `disabled`: a disabled button receives no
        // pointer event, so never displays its tooltip — but this is
        // in read-only that we MOST need to read what the emoji wants
        // say. The click is refused here, and `toggle` already refuses the duplicate.
        const locked = !reactions.canReact || busy;
        return (
          <Tooltip key={reaction.content}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={reaction.mine}
                aria-disabled={locked}
                aria-label={t(REACTION_LABELS[reaction.content])}
                onClick={() => {
                  if (locked) return;
                  void reactions.toggle(commentId, reaction.content, !reaction.mine);
                }}
                className={cn(
                  "flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs tabular-nums transition-colors",
                  reaction.mine
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                  locked && "cursor-default opacity-70",
                )}
              >
                <span className="text-[13px] leading-none">
                  {REVIEW_REACTION_EMOJI[reaction.content]}
                </span>
                {reaction.count}
              </button>
            </TooltipTrigger>
            {/* The name of the emoji, and — when it’s mine — the gesture that a
                second click would do. The forges do not name their reactors
                the same way: we cannot promise “X and Y reacted”
                from GitHub without it missing on one side. */}
            <TooltipContent side="top">
              {reaction.mine ? t("reactionMine") : t(REACTION_LABELS[reaction.content])}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {/* The add button closes the strip: the line says "here are the reactions, and
          here’s how to put one on.” Permanently visible, unlike
          that of the header — the line is already there, nothing to reveal. */}
      {reactions.canReact ? (
        <ReactionPicker onPick={reactionToggler(reactions, commentId, list)} />
      ) : null}
    </div>
  );
}

/** The palette: the eight reactions that GitHub accepts, not one more. */
export function ReactionPicker({
  onPick,
  className,
}: {
  onPick: (content: ReviewReactionContent) => void;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* The button has an icon and nothing else: what it does should read
          without clicking. Tooltip rather than native `title` — it's the one for the rest
          of the app (the “Quote” of the thread is right next to it), it shows up straight away
          continuation where the browser's `title` waits a second. THE
          two triggers are nested in `asChild`: the Radix recipe for
          that a tooltip and a popover share the SAME button — the click that
          opens the palette closes the tooltip in passing.

          A circle of 28 px, in `Button` ghost: EXACTLY the shape of the “Quote”
          that follows it in the header of a message, and the height of the chips of the
          reaction band. These neighbors always go side by side — the
          The slightest difference in size or treatment reads as a defect.
          The vertical catch-up belongs to the HEADER (`-my-1` at
          the caller): in the reaction band there is nothing to catch up on. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("addReaction")}
              className={cn("size-7 rounded-full text-muted-foreground", className)}
            >
              <SmilePlus className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("addReaction")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" sideOffset={6} className="flex w-auto gap-0.5 p-1">
        {REVIEW_REACTIONS.map((content) => (
          <button
            key={content}
            type="button"
            aria-label={t(REACTION_LABELS[content])}
            title={t(REACTION_LABELS[content])}
            onClick={() => {
              setOpen(false);
              onPick(content);
            }}
            className="rounded-md px-1.5 py-1 text-base leading-none transition-colors hover:bg-muted"
          >
            {REVIEW_REACTION_EMOJI[content]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Body of a comment: avatar, author, time, markdown, reactions. */
function CommentBody({
  comment,
  reactions,
}: {
  comment: PullRequestReviewComment;
  /** Absent when the forge has not been able to read them: nothing is then displayed. */
  reactions?: CommentReactions;
}) {
  const format = useFormatter();
  const now = useNow();
  const list = reactions?.byComment.get(comment.id) ?? [];
  return (
    <div className="group flex flex-col gap-1">
      <div data-testid="review-comment-author" className="flex items-center gap-2">
        <ForgeUserAvatar
          user={comment.user}
          className="size-5"
        />
        <GitLogin
          login={comment.user?.login}
          className="text-sm font-medium text-foreground"
        />
        <span className="shrink-0 text-xs text-muted-foreground/80">
          {format.relativeTime(new Date(comment.created_at), now)}
        </span>
        {/* The fallback of the header, for a comment WITHOUT reaction: as soon as it
            wears one, the palette goes down in the band, with the emoji that it
            adds. Here it is revealed on hover, like the “+” of the gutter
            right next to it — a permanent palette under each message would make a
            checkerboard of buttons. Rendered anyway (and not edited on hover) for
            remain reachable on the keyboard — `focus-visible` turns it back on. */}
        {reactions?.canReact && list.length === 0 ? (
          <ReactionPicker
            className="-my-1 ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onPick={reactionToggler(reactions, comment.id, list)}
          />
        ) : null}
      </div>
      <div data-testid="review-comment-body" className="pl-7">
        <Markdown className="text-sm text-foreground">{comment.body}</Markdown>
      </div>
      {reactions && list.length > 0 ? (
        <div className="pl-7">
          <CommentReactionChips commentId={comment.id} reactions={reactions} list={list} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Input area shared by the composer of a new line comment and
 * that of a response. ⌘/Ctrl+Enter sends, Escape closes; the text is NEVER
 * cleared by the caller until the upload is successful (a GitHub failure should not
 * not cost the message).
 *
 * This is THE SAME composition as that of the wire since MIN-162 — mentions of accounts
 * of the forge, attachments, markdown preview — alternatively `line`: more
 * compact, suggestions down, and a Cancel as it opens and closes.
 * A line remark is a GitHub comment like any other; nothing
 * justified it remaining a bare textarea when the thread knew how to do everything.
 *
 * The endpoint comes from the context: the diff view is crossed by the PR panel
 * as by the conversation of a run, and none of the intermediate components have
 * to raise the question.
 */
function Composer({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  placeholder,
  submitLabel,
  autoFocus,
}: {
  value: string;
  onChange: (transform: (draft: string) => string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
}) {
  const endpoint = usePrEndpoint();

  // Outside of a PR view (the diff lab, a session without PR) there is no
  // no account to mention or place to host a file: we keep the field
  // simple rather than offering gestures that would fail.
  if (!endpoint) {
    return (
      <PlainComposer
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitting={submitting}
        placeholder={placeholder}
        submitLabel={submitLabel}
        autoFocus={autoFocus}
      />
    );
  }

  return (
    <PrCommentComposer
      variant="line"
      endpoint={endpoint}
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
      posting={submitting}
      placeholder={placeholder}
      submitLabel={submitLabel}
      autoFocus={autoFocus}
    />
  );
}

/** The front field, kept for surfaces without pull requests. */
function PlainComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  placeholder,
  submitLabel,
  autoFocus,
}: {
  value: string;
  onChange: (transform: (draft: string) => string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations("PullRequests");
  const isSend = useIsSendShortcut();

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full rounded-lg border border-border bg-background transition-colors focus-within:border-ring">
        <AutoTextarea
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(() => e.target.value)}
          onKeyDown={(e) => {
            if (isSend(e)) {
              e.preventDefault();
              onSubmit();
            }
            if (e.key === "Escape") onCancel();
          }}
          placeholder={placeholder}
          className="max-h-40 w-full overflow-y-auto bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          {t("cancel")}
        </Button>
        <SendShortcutTooltip label={submitLabel}>
          <Button size="sm" onClick={onSubmit} disabled={submitting || !value.trim()}>
            {submitting ? <Spinner /> : null}
            {submitLabel}
          </Button>
        </SendShortcutTooltip>
      </div>
    </div>
  );
}

/** New comment on a line — rendered below the intended line. */
export function LineComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitting,
}: {
  value: string;
  onChange: (transform: (draft: string) => string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const t = useTranslations("PullRequests");
  return (
    <div className="border-l-2 border-brand/40 bg-muted/30 px-3 py-2.5">
      <Composer
        autoFocus
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitting={submitting}
        placeholder={t("lineCommentPlaceholder")}
        submitLabel={t("postLineComment")}
      />
    </div>
  );
}

/**
 * A thread: comments stacked, then “Reply” and “Resolve”.
 *
 * A RESOLVED thread becomes FOLDED — a single “✓ Resolved by X” line, unfoldable.
 * That's the whole point of MIN-139: as long as a processed thread was displayed exactly
 * like an open thread, resolving it would not have changed anything on screen. The fallback is
 * local and non-persistent: reopening the page folds again, which is indeed the
 * desired reading (“this point is settled, move on to the next one”).
 *
 * `resolution` may be missing on wire (`thread.resolution === undefined`) when
 * the forge did not know how to tell the state: we then display NO affordance, rather
 * than a button that pretends to know.
 */
export function ReviewThreadCard({
  thread,
  replies,
  resolution,
  reactions,
  readOnly,
  variant = "card",
}: {
  thread: PrReviewThread;
  replies: ReviewReplies;
  /** Absent when the thread does not resolve: either the forge says nothing about it, or the
      git account does not have permission to write to the repository (MIN-144). */
  resolution?: ThreadResolution;
  /** Reactions from the PR (MIN-139) — each comment has its own. */
  reactions?: CommentReactions;
  /** The thread reads but does not respond — no git account, or no access to the
      deposit: the response would be sent under the identity of the bot (MIN-144). */
  readOnly?: boolean;
  /** Activity already provides the surrounding code-comment surface. */
  variant?: "card" | "plain";
}) {
  const t = useTranslations("PullRequests");
  const replyingUser = usePrReplyingUser();
  const [expanded, setExpanded] = useState(false);
  const state = thread.resolution;
  const resolved = !!state?.resolved;
  const pending = resolution?.pendingId === thread.id;

  const resolvedLabel = state?.resolvedBy
    ? t("threadResolvedBy", { name: state.resolvedBy })
    : t("threadResolved");

  if (resolved && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/70"
      >
        {/* The chevron says that the line is UNFOLDING — the same signal as the folding of the
            expired wires just below. Without it, the resolved card reads like
            a dead label and the thread seems lost. */}
        <ChevronRight className="size-3.5 shrink-0" />
        <CircleCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="min-w-0 flex-1 truncate">{resolvedLabel}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground/80">
          {t("showResolvedThread", { count: thread.comments.length })}
        </span>
      </button>
    );
  }

  return (
    <div
      data-testid="review-thread-card"
      data-variant={variant}
      className={cn(
        "flex flex-col gap-3",
        variant === "card" && "rounded-md border border-border bg-card px-3 py-2.5",
      )}
    >
      {/* Unfolded, the header FOLDED: the gesture must be reversible where it was
          done, otherwise the only way back is to reload the page. */}
      {resolved ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className="size-3.5 shrink-0" />
          <CircleCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="min-w-0 truncate">{resolvedLabel}</span>
        </button>
      ) : null}
      {thread.comments.map((c) => (
        <CommentBody key={c.id} comment={c} reactions={reactions} />
      ))}
      {replies.replyingId === thread.id ? (
        <Composer
          autoFocus
          value={replies.valueFor(thread.id)}
          onChange={(next) => replies.change(thread.id, next)}
          onSubmit={() => void replies.submit(thread.id)}
          onCancel={replies.cancel}
          submitting={replies.postingId === thread.id}
          placeholder={t("replyPlaceholder")}
          submitLabel={t("postReply")}
        />
      ) : (
        <div className="flex items-center gap-1.5">
          {readOnly ? null : (
            <Button
              data-testid="review-thread-reply"
              variant="outline"
              size="sm"
              className="rounded-full leading-none"
              onClick={() => replies.start(thread.id)}
            >
              {replyingUser ? (
                <ForgeUserAvatar user={replyingUser} className="size-5" />
              ) : null}
              <span className="inline-flex h-5 items-center leading-none">
                {t("reply")}
              </span>
            </Button>
          )}
          {resolution && state ? (
            <Button
              data-testid="resolve-conversation"
              variant="ghost"
              size="sm"
              disabled={pending}
              // The unfolding is LOCAL, so it survives the switch: without this reset,
              // a thread unfolded then reopened then re-resolved would remain unfolded — or
              // it is the folding that causes a treated yarn to stop looking like a
              // open wire. Reopening does not suffer: `resolved` returns to false,
              // the map is full anyway.
              onClick={() => {
                setExpanded(false);
                void resolution.toggle(thread);
              }}
            >
              {pending ? <Spinner /> : null}
              {resolved ? t("unresolveThread") : t("resolveThread")}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Annotation of a line: all its children, then compose it if it is open.
 * Rendered in light DOM and projected by the diff lib under the target line.
 *
 * The header names the line. Without it, the thread floats UNDER the line without saying anything
 * of what it is linked to - and in a unified view it is frankly ambiguous: a
 * modified line produces TWO lines with the same number (deleted then
 * added it), therefore two neighboring annotations. “added” / “deleted”
 * tiebreaker. A range (multi-line comment) is said from both ends.
 */
export function LineWidget({
  anchor,
  children,
}: {
  /** Target line + nature of change, for the header. */
  anchor: {
    line: number;
    /** First line of a range — absent for a single-line remark. */
    startLine?: number;
    kind: "added" | "removed" | "context";
  };
  children: React.ReactNode;
}) {
  const t = useTranslations("PullRequests");
  const label =
    anchor.startLine != null
      ? t("lineAnchorRange", { start: anchor.startLine, end: anchor.line })
      : anchor.kind === "added"
        ? t("lineAnchorAdded", { line: anchor.line })
        : anchor.kind === "removed"
          ? t("lineAnchorRemoved", { line: anchor.line })
          : t("lineAnchor", { line: anchor.line });

  return (
    <div className="flex flex-col gap-2 bg-muted/20 px-3 py-2.5">
      {/* The arrow ↳ says “this relates to the above”. */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CornerDownRight className="size-3 shrink-0" />
        <span className="font-mono">{label}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Threads which are no longer anchored in the rendered diff (decision: folded at the bottom of the
 * file). Everyone keeps their original `diff_hunk`: without it, “and the null case? »
 * can be read without knowing which code it referred to.
 */
export function StaleThreads({
  threads,
  replies,
  resolution,
  reactions,
  readOnly,
  label,
}: {
  threads: PrReviewThread[];
  replies: ReviewReplies;
  resolution?: ThreadResolution;
  reactions?: CommentReactions;
  /** Propagated to maps: without a git account, these threads are read only. */
  readOnly?: boolean;
  /** Title of the fallback — the orphan case cannot be told like an out-of-date one. */
  label?: (count: number) => string;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);

  if (threads.length === 0) return null;

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/60"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        {label ? label(threads.length) : t("staleComments", { count: threads.length })}
      </button>
      {open ? (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {threads.map((thread) => {
            const line = displayLineOf(thread.root);
            return (
              <div key={thread.id} className="flex flex-col gap-1.5">
                {/* The hunk as he was at the time of the comment — the context
                    that the current diff no longer shows. Without him, “what about the null case?” »
                    se lit sans savoir de quel code il parlait.

                    Rendered by the diff lib like the file just above, and
                    no longer in raw `<pre>`: an outdated thread speaks the same code
                    than the diff, it does not have to display in another language.
                    `maxLines={0}` — the whole hunk: here he IS the only context,
                    where in the activity thread it only recalls a line
                    which you can read in the Files tab. */}
                <PrHunk
                  path={thread.root.path}
                  line={line}
                  diffHunk={thread.root.diff_hunk}
                  maxLines={0}
                  className="rounded-md border border-border"
                />
                <ReviewThreadCard
                  thread={thread}
                  replies={replies}
                  resolution={resolution}
                  reactions={reactions}
                  readOnly={readOnly}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
