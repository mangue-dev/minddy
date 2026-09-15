"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Button,
  Checkbox,  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
  toast,
} from "mangue-ui";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Ellipsis,
  Eye,
  ExternalLink,
  GitPullRequest,
  GitPullRequestDraft,
  History,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Reply,
  RotateCcw,
  X,
} from "lucide-react";
import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import { AppContentHeader } from "@/components/app-content-header";
import { BotBadge, GitLogin } from "@/components/git/git-login";
import { Markdown } from "@/components/markdown";
import { TAB_LIST_DENSE, TAB_TRIGGER_DENSE } from "@/components/tab-bar";
import { NumoIcon } from "@/components/numo-icon";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { PrCommits } from "@/components/pull-requests/pr-commits";
import { PrCommentComposer } from "@/components/pull-requests/pr-comment-composer";
import { PrDiff } from "@/components/pull-requests/pr-diff";
import { PrLinkIssue } from "@/components/pull-requests/pr-link-issue";
import {
  CommentReactionChips,
  useCommentReactions,
  type CommentReactions,
} from "@/components/pull-requests/pr-review-comments";
import { PrReviewCard } from "@/components/pull-requests/pr-review-thread";
import { PrTimelineReview, PrTimelineRow } from "@/components/pull-requests/pr-timeline";
import { PrStateBadge } from "@/components/pull-requests/pr-state-badge";
import { PrReadinessBadge, PrReadinessControl } from "@/components/pull-requests/pr-readiness";
import { PrStatusCards } from "@/components/pull-requests/pr-readiness-cards";
import { PrUnresolvedConversations } from "@/components/pull-requests/pr-unresolved-conversations";
import { PrViewerCallout } from "@/components/pull-requests/pr-viewer-callout";
import { FormDialog } from "@/components/form-dialog";
import {
  AttachButton,
  DropOverlay,
  pasteFileHandler,
  useFileDrop,
} from "@/components/resources";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";
import { useAgentErrorMessage } from "@/lib/use-agent-error-message";
import {
  usePullRequestQuery,
  usePrCommentsQuery,
  usePrCommitsQuery,
  usePrReviewCommentsQuery,
} from "@/lib/use-agent-runs";
import {
  actOnPullRequestApi,
  fetchPullRequestCommentEditsApi,
  maintainPullRequestApi,
  postPullRequestCommentApi,
  prEndpoint,
  submitPullRequestReviewApi,
  updatePullRequestCommentApi,
  type PullRequestCheck,
  type MergeMethod,
  type PullRequestComment,
  type PullRequestCommentEdit,
  type PullRequestCommit,
  type PullRequestListItem,
  type PullRequestReviewComment,
  type PrEndpoint,
  type ReviewVerdict,
} from "@/lib/agent-api";
import {
  blockReadinessForRequestedReview,
  type ReadinessAction,
  type ReadinessBlocker,
} from "@/lib/pr-readiness";
import { viewerReviewIsRequested } from "@/lib/pr-review-request";
import {
  findRerunnableChecks,
  type PullRequestDetailTab,
} from "@/lib/pr-readiness-actions";
import { normalizeForgeInstant } from "@/lib/forge-time";
import { REPO_PROVIDERS } from "@/lib/repo-providers";
import { PrEndpointProvider } from "@/lib/pr-endpoint-context";
import { issueIdentifier } from "@/lib/issue-constants";
import { usePrReviewSession } from "@/lib/use-pr-review-session";
import { usePrLive } from "@/lib/use-pr-live";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { useForgeUploads } from "@/lib/use-forge-uploads";
import { PR_BODY_COMMENT_ID } from "@/lib/pr-review-reactions";
import { reviewedFileCount, setFileReviewed } from "@/lib/pr-file-review";
import {
  defaultMergeCommitMessage,
  shouldSubmitCustomMergeMessage,
  type MergeCommitMessageDraft,
} from "@/lib/pr-merge-message";
import {
  groupTimelineReviews,
  resolveCommitActors,
  sortTimelineOlderFirst,
  type PrTimelineEvent,
} from "@/lib/pr-timeline";
import {
  buildPullRequestFeedbackPrompt,
  unresolvedReviewThreads,
} from "@/lib/pr-unresolved-conversations";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import type { AssistantPageContext } from "@/lib/assistant-types";
import { parseForgeLogin, prIdentifier } from "@/lib/repo-providers";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * PR detail panel (MIN-66 + MIN-138 + MIN-143): header (ticket +
 * status + actions), CI checks banner, then two GitHub-style tabs — the thread
 * conversation (PR description + comments) and modified files.
 * Everything is controlled by `item.prId`: since MIN-143 the PR no longer belongs to the run
 * who opened it, and a human PR has none.
 *
 * A run still controls the “Generated by Numo” badge. All provider actions remain
 * available without a run: review, comments, closing, readiness, and merge.
 * “Fix feedback” may start from the current PR head even when Numo did not create it.
 */

/**
 * Copy pill for the head branch, next to the branch code: the branch name
 * is the fastest way to check out the PR locally, and it is never typed
 * twice by hand. Same feedback loop as the SHA button of the commits tab —
 * copy, then the icon flips to a check.
 */
function CopyBranchButton({ value }: { value: string }) {
  const t = useTranslations("PullRequests");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-testid="pr-copy-head-branch"
          variant="ghost"
          size="icon-sm"
          className="size-6 text-muted-foreground"
          aria-label={t("copyBranch")}
          onClick={() => void copy()}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{t("copyBranch")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * An entry from the conversation thread, messages AND activity combined (MIN-159).
 * The thread is ONE chronological sequence, like on GitHub: a comment, a
 * review, a push and a title change are read in the order in which they were
 * took place, not in three separate lists.
 */
type FeedEntry =
  | { key: string; id: string; createdAt: string | null; kind: "comment"; comment: PullRequestComment }
  | { key: string; id: string; createdAt: string | null; kind: "event"; event: PrTimelineEvent }
  | {
      key: string;
      id: string;
      createdAt: string | null;
      kind: "review";
      event: PrTimelineEvent;
      comments: PullRequestReviewComment[];
    };

/**
 * Messages + activity, merged and put back in order.
 *
 * Four rules carry the entire result:
 * - a commit is signed by its forge ACCOUNT, not by the written `user.name`
 * inside (`resolveCommitActors`): the timeline only knows the second, and
 * the list of commits — already loaded for its tab — is the first one;
 * - commits remain separate, matching GitHub's activity feed and preserving
 *   each commit message and SHA;
 * - reviews without a body by the same author fold in the same way
 * (`groupTimelineReviews`): at GitHub, a single point IS a review,
 * and a pass from Numo drops a dozen in a row;
 * - a review becomes a MAP as soon as it has something to say — a body,
 * or points placed on the code. A bare approval remains a line: it
 * has no content, and giving it an empty card would be lying about its weight.
 */
function buildFeed(
  comments: PullRequestComment[],
  timeline: PrTimelineEvent[],
  reviewComments: PullRequestReviewComment[],
  commits: PullRequestCommit[],
): FeedEntry[] {
  const commentsByReview = new Map<number, PullRequestReviewComment[]>();
  for (const comment of reviewComments) {
    if (comment.review_id == null) continue;
    const list = commentsByReview.get(comment.review_id);
    if (list) list.push(comment);
    else commentsByReview.set(comment.review_id, [comment]);
  }

  const entries: FeedEntry[] = comments.map((comment) => ({
    key: `comment:${comment.id}`,
    id: `comment:${comment.id}`,
    createdAt: comment.created_at,
    kind: "comment",
    comment,
  }));

  const events = groupTimelineReviews(resolveCommitActors(timeline, commits));
  for (const event of events) {
    if (event.kind === "reviewed") {
      const own = (event.reviewIds ?? []).flatMap((id) => commentsByReview.get(id) ?? []);
      if (event.body || own.length > 0) {
        entries.push({
          key: event.id,
          id: event.id,
          createdAt: event.createdAt,
          kind: "review",
          event,
          comments: own,
        });
        continue;
      }
    }
    entries.push({ key: event.id, id: event.id, createdAt: event.createdAt, kind: "event", event });
  }

  return sortTimelineOlderFirst(entries);
}

/**
 * A conversation message, as a self-contained card (MIN-548): no rail, no
 * bubble pointer — the ticket timeline comment template.
 *
 * The header carries ONE hover-revealed more menu (Ellipsis) instead of a
 * standalone quote button: editing one's own message (MIN-548) added a second
 * gesture, and two buttons appearing on hover was one too many. The menu
 * holds Edit (own human message only), Quote, and — when the message was
 * edited — the list of its previous versions, fetched lazily on menu open.
 */
function ThreadComment({
  endpoint,
  commentId,
  user,
  createdAt,
  updatedAt,
  body,
  canEdit,
  onEdited,
  onSave,
  onQuoteReply,
  quotingNumo,
  forceBot,
  reactions,
  activity,
}: {
  /** Routes of this PR — the edit composer reuses them (mentions, uploads). */
  endpoint: PrEndpoint;
  commentId: number;
  user: { login: string; avatar_url: string | null } | null;
  createdAt: string | null;
  /** Last edit at the forge — the "(edited)" marker compares it to `createdAt`. */
  updatedAt?: string | null;
  body: string;
  /** The viewer may edit THIS message: own human message with an account on
      the forge. The PR body is excluded — editing it is out of scope. */
  canEdit?: boolean;
  /** Refetch the thread after a saved edit: the card alone does not own the
      comments query, and the cache must not show the old body. */
  onEdited?: () => void;
  /** Where a saved edit goes, when the card is NOT a forge comment — the PR
      body rewrites itself through the PR, not through a comment id. */
  onSave?: (body: string) => Promise<void>;
  /** Absent when there is no composition where to cite: to cite without power
      answering leads nowhere (MIN-144). */
  onQuoteReply?: () => void;
  /** This message is from Numo: quote RAPPELLE (MIN-162), and the gesture is called
      otherwise — “Reply with quote” does not say it will re-roll a pass. */
  quotingNumo?: boolean;
  /** Numo can use a provider account whose login does not expose a bot suffix. */
  forceBot?: boolean;
  /** Absent when the forge has not been able to read them: nothing is then displayed. */
  reactions?: CommentReactions;
  /** Unrolled folded ABOVE the body, for the message which carries one — the
      Numo's review is the only case: his verdict is the message, his work
      is what produced it. */
  activity?: React.ReactNode;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useNow();
  const list = reactions?.byComment.get(commentId) ?? [];
  const when = normalizeForgeInstant(createdAt, now);
  const edited = !!updatedAt && updatedAt !== createdAt;
  // The history only exists when the forge says the message moved: opening the
  // menu on an unedited message would fire a useless request every hover.
  const [menuOpen, setMenuOpen] = useState(false);
  const [edits, setEdits] = useState<PullRequestCommentEdit[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Lazily on menu open, and only once: previous versions never change —
  // a snapshot is frozen at the moment it was taken.
  useEffect(() => {
    if (!menuOpen || !edited || edits) return;
    let cancelled = false;
    fetchPullRequestCommentEditsApi(endpoint, commentId)
      .then(({ edits: rows }) => {
        if (!cancelled) setEdits(rows);
      })
      .catch(() => {
        // An unreadable history hides the menu entry rather than failing.
        if (!cancelled) setEdits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [menuOpen, edited, edits, endpoint, commentId]);

  const save = async () => {
    const next = draft.trim();
    if (!next || saving) return;
    setSaving(true);
    try {
      if (onSave) {
        await onSave(next);
      } else {
        await updatePullRequestCommentApi(endpoint, { commentId, body: next });
      }
      setEditing(false);
      onEdited?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article
      data-testid="pr-activity-message"
      className="group overflow-clip rounded-lg border border-border bg-card shadow-xs"
    >
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <header className="flex min-h-5 items-center gap-2">
          <ForgeUserAvatar
            user={user}
            forceBot={forceBot}
            className="size-5 shrink-0"
          />
          <GitLogin
            login={user?.login}
            className="text-sm font-medium text-foreground"
          />
          {when ? (
            <span className="shrink-0 text-xs text-muted-foreground/80">
              {format.relativeTime(when, now)}
            </span>
          ) : null}
          {edited ? (
            <span className="shrink-0 text-xs text-muted-foreground/60">{t("edited")}</span>
          ) : null}
          <span className="min-w-0 flex-1" />
          {editing ? (
            <Button
              variant="ghost"
              size="sm"
              className="-my-1 text-muted-foreground"
              onClick={() => {
                setEditing(false);
                setDraft("");
              }}
            >
              {t("cancel")}
            </Button>
          ) : (canEdit || onQuoteReply || edited) ? (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("commentMoreActions")}
                  className="-my-1 size-7 rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Ellipsis className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setDraft(body);
                      setEditing(true);
                    }}
                  >
                    <Pencil />
                    {t("editComment")}
                  </DropdownMenuItem>
                ) : null}
                {onQuoteReply ? (
                  <DropdownMenuItem onClick={onQuoteReply}>
                    <Reply />
                    {t(quotingNumo ? "quoteReplyNumo" : "quoteReply")}
                  </DropdownMenuItem>
                ) : null}
                {/* The history is always offered on an edited message: the
                    lazy read may fail or return nothing — the dialog says so,
                    and the menu must never open empty. */}
                {edited ? (
                  <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                    <History />
                    {t("viewPreviousVersions")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </header>
        {activity ? <div>{activity}</div> : null}
        {editing ? (
          // Inline edit state: the same composer as the thread — mentions,
          // uploads, preview — anchored under the message it rewrites. The
          // original text is the starting draft; Cancel throws it away.
          <PrCommentComposer
            endpoint={endpoint}
            value={draft}
            onChange={(transform) => setDraft((current) => transform(current))}
            onSubmit={() => void save()}
            onCancel={() => {
              setEditing(false);
              setDraft("");
            }}
            posting={saving}
            placeholder={t("editCommentPlaceholder")}
            submitLabel={t("saveChanges")}
            autoFocus
          />
        ) : (
          <Markdown
            allowRawHtml
            linkVariant="plain"
            className="text-foreground [&_code]:bg-primary/10 [&_code]:text-primary [&_pre_code]:text-inherit"
          >
            {body}
          </Markdown>
        )}
        {reactions && (list.length > 0 || reactions.canReact) ? (
          <div>
            <CommentReactionChips commentId={commentId} reactions={reactions} list={list} />
          </div>
        ) : null}
      </div>
      {historyOpen ? (
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("previousVersionsTitle")}</DialogTitle>
            </DialogHeader>
            <div className="flex max-h-96 min-w-0 flex-col gap-4 overflow-y-auto">
              {!edits ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="size-3.5 shrink-0" />
                  {t("previousVersionsLoading")}
                </div>
              ) : edits.length > 0 ? (
                edits.map((edit, index) => {
                  const editedWhen = normalizeForgeInstant(edit.created_at, now);
                  return (
                    // Oldest-first, like the timeline of the thread: the
                    // original at the top, the version the current body
                    // replaced at the bottom.
                    <div key={edit.created_at + index} className="flex flex-col gap-1.5">
                      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <GitLogin
                          login={edit.edited_by}
                          className="font-medium text-foreground"
                        />
                        {editedWhen ? format.relativeTime(editedWhen, now) : null}
                        {index === edits.length - 1 ? (
                          <span className="text-muted-foreground/60">
                            {t("previousVersionsLast")}
                          </span>
                        ) : null}
                      </div>
                      <div className="rounded-md border border-border bg-background px-3 py-2">
                        <Markdown
                          allowRawHtml
                          linkVariant="plain"
                          className="text-sm text-foreground [&_code]:bg-primary/10 [&_code]:text-primary"
                        >
                          {edit.body}
                        </Markdown>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">{t("previousVersionsEmpty")}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setHistoryOpen(false)}>
                {t("close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </article>
  );
}

export function PrDetail({
  item,
  onBack,
  onRefetchList,
  onOptimisticStateChange,
  onStateChange,
  onOpenIssue,
}: {
  item: PullRequestListItem;
  onBack: () => void;
  onRefetchList: () => void;
  /** Patches the sidebar upon clicking and renders a restoration if the forge refuses. */
  onOptimisticStateChange: (
    prId: string,
    state: PullRequestListItem["pr_state"],
  ) => () => void;
  /** Aligns the local cache to the state actually returned by the forge. */
  onStateChange: (prId: string, state: PullRequestListItem["pr_state"]) => void;
  /** Opens the linked issue in the side panel, above the page (no navigation). */
  onOpenIssue: (issueId: string, projectId: string) => void;
}) {
  const t = useTranslations("PullRequests");
  const tAgent = useTranslations("Agent");
  const router = useRouter();
  const agentErrorMessage = useAgentErrorMessage();
  const { openIntent } = useAssistantPanel();
  const isSend = useIsSendShortcut();
  const format = useFormatter();

  const {
    pr,
    files,
    checks,
    deploymentUrl,
    deploymentDurationMs,
    viewer,
    mergePolicy,
    readiness,
    loading,
    refetch: refetchPr,
  } = usePullRequestQuery(item.prId, true);
  const {
    comments,
    timeline,
    reactions: commentReactions,
    loading: commentsLoading,
    refetch: refetchComments,
  } = usePrCommentsQuery(item.prId);
  const {
    commits,
    truncated: commitsTruncated,
    loading: commitsLoading,
    refetch: refetchCommits,
  } = usePrCommitsQuery(item.prId);
  const {
    comments: reviewComments,
    threads: reviewThreads,
    reactions: reviewReactions,
    refetch: refetchReviewComments,
  } = usePrReviewCommentsQuery(prEndpoint(item.prId));
  const unresolvedThreads = useMemo(
    () => unresolvedReviewThreads(reviewComments, reviewThreads),
    [reviewComments, reviewThreads],
  );
  const refreshReviewState = useCallback(async () => {
    await Promise.all([refetchReviewComments(), refetchPr()]);
  }, [refetchPr, refetchReviewComments]);
  // Live from THIS PR (MIN-161): the server pushes “this part has moved”
  // on `pull-request:{id}`, and these four caches will reread. This is what makes
  // such as a comment posted on github.com, a pushed commit, an approval or
  // a resolved wire reaches the open panel without reloading.
  usePrLive(item.prId);

  const [acting, setActing] = useState<
    null | "merge" | "close" | "reopen" | "ready_for_review" | "convert_to_draft"
  >(null);
  const [maintenanceAction, setMaintenanceAction] = useState<ReadinessAction | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  // The merge is confirmed WITH its method: bring it to the confirmation state
  // prevents a click on “merge anyway” from falling back to the default squash.
  const [confirmAction, setConfirmAction] = useState<
    null | { kind: "merge"; method?: MergeMethod } | { kind: "close" }
  >(null);
  const [mergeCommitDraft, setMergeCommitDraft] = useState<MergeCommitMessageDraft | null>(null);
  const [mergeCommitDraftEdited, setMergeCommitDraftEdited] = useState(false);
  const [reviewVerdict, setReviewVerdict] = useState<ReviewVerdict | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewFromFiles, setReviewFromFiles] = useState(false);
  const [fileReviewActive, setFileReviewActive] = useState(false);
  const [reviewedFiles, setReviewedFiles] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [relaunch, setRelaunch] = useState(true);
  /**
   * The two modes of “requesting changes” (the dialogue makes them
   * tabs, and only this request has two):
   * · `write` — we write the instruction. It serves as a VERDICT on the forge and as a
   * quick to Numo: it is the historic gesture;
   * · `findings` — we don't write it, we ask Numo to take the
   * remarks ALREADY left on the PR. Nothing is published in the name
   * of the person: the text is an instruction, not a review.
   */
  const [reviewMode, setReviewMode] = useState<"write" | "findings">("write");
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const reviewUploads = useForgeUploads(prEndpoint(item.prId), (transform) =>
    setReviewMessage((draft) => transform(draft)),
  );
  const reviewDrop = useFileDrop(reviewUploads.addFiles);
  // Numo rereads the PR (MIN-141): a SESSION, not a blocking call — it is
  // plays IN the thread, in place of its future verdict message, and survives a
  // rechargement.
  const reviewSession = usePrReviewSession(item.prId);
  const [aiReviewDialog, setAiReviewDialog] = useState(false);
  const [tab, setTab] = useState<PullRequestDetailTab>("activity");
  /** The Files diff is long: past ~600px scrolled, a floating button offers
      the way back to the toolbar and the file tree. */
  const [scrolledDown, setScrolledDown] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [unresolvedSidebarOpen, setUnresolvedSidebarOpen] = useState(false);
  // Soft fade up and down the feed — the same as the agent conversation and
  // than the columns of the board: it only lights up on the side where there REMAINS some
  // something to see, what a fixed border cannot say.
  const feedFade = useScrollFade<HTMLDivElement>();
  // “Cite” written in the draft from outside the composer: this
  // counter tells him to go take the cursor again.
  const [quoteFocus, setQuoteFocus] = useState(0);
  // The message this draft responds to, with the quote it inserted —
  // it is she who certifies, when sent, that we always respond to this message.

  const isWorking = !!item.activeRunId;
  // What THIS git account can do on this repository (MIN-144). A human gesture leaves
  // of the person's account: without account, or without right, the affordance
  // DISAPPEARS — it’s the banner that explains, once, at the top.
  const canWrite = viewer?.capability === "write";
  const canComment = canWrite || viewer?.capability === "read";
  // React to thread (MIN-147): same hook, same chips, same palette as the diff —
  // only the road changes. `canComment` (therefore `read`) is enough: the withdrawal rereads
  // the reactions of the message with this token, like the review side.
  const threadReactions = useCommentReactions(
    prEndpoint(item.prId),
    refetchComments,
    commentReactions,
    !!canComment,
    "conversation",
  );
  // A fix request is anchored to the selected PR itself, not to a historical
  // worker run. This keeps the action available for human-authored PRs too.
  const canRelaunch =
    item.pr_state !== "merged" &&
    item.pr_state !== "closed" &&
    !!pr?.head &&
    !!item.project;
  // `item` comes from the list (DB value, possibly late by a webhook),
  // `pr` of the forge's GET (the truth): the forge wins as soon as it responds.
  const isDraft = pr?.draft ?? item.pr_state === "draft";
  const isTerminal = item.pr_state === "merged" || item.pr_state === "closed";
  const badgeState = isDraft && !isTerminal ? "draft" : item.pr_state;
  // Closed is not over: the two forges reopen, and a PR closed by
  // error was only caught on github.com (MIN-164). Merged, in
  // However, is definitive - the forge refuses, and there is nothing to offer.
  const canReopen = canWrite && item.pr_state === "closed";
  // When Numo finishes (the active run disappears from the list), refresh diff +
  // comments. Line comments are one of them: Numo can have
  // answered, and a new push changes the rows they anchor to. THE
  // commits too: this is the only time when the list changes before your eyes.
  const prevWorking = useRef(isWorking);
  useEffect(() => {
    if (prevWorking.current && !isWorking) {
      void refetchPr();
      void refetchComments();
      void refetchCommits();
      void refetchReviewComments();
    }
    prevWorking.current = isWorking;
  }, [isWorking, refetchPr, refetchComments, refetchCommits, refetchReviewComments]);

  const aiReviewActive = reviewSession.active;
  const reviewRequested = viewerReviewIsRequested(pr, viewer);
  const effectiveReadiness = useMemo(
    () =>
      readiness
        ? blockReadinessForRequestedReview(readiness, reviewRequested)
        : null,
    [readiness, reviewRequested],
  );

  // When the pass ends, what she wrote is ON PR: the summary
  // in the thread, points in the Files tab. The two surfaces
  // refresh, like after the end of a run.
  const prevReviewing = useRef(aiReviewActive);
  useEffect(() => {
    if (prevReviewing.current && !aiReviewActive) {
      void refetchComments();
      void refetchReviewComments();
    }
    prevReviewing.current = aiReviewActive;
  }, [aiReviewActive, refetchComments, refetchReviewComments]);

  // Has Numo ever proofread EXACTLY this diff? As long as the head hasn't moved,
  // rerolling would repay a pattern turn for the same code. Unknown head (the
  // forge has not yet responded) = we're not stopping anything: it's better to leave
  // restart than block on ignorance.
  const currentHeadSha = pr?.headSha ?? null;
  const reviewUpToDate =
    !!currentHeadSha && reviewSession.reviewedHeadSha === currentHeadSha;
  const completedReviewSessionHref =
    reviewSession.run?.status === "completed"
      ? `/agents?run=${encodeURIComponent(reviewSession.run.runId)}`
      : null;

  const prPageContext = useMemo<AssistantPageContext | null>(
    () =>
      item.project
        ? {
            projectId: item.project.id,
            pullRequestId: item.prId,
            prNumber: item.pr_number,
            prState: item.pr_state,
            prHeadRef: pr?.head ?? item.head_branch ?? undefined,
            prBaseRef: pr?.base,
            prRunId: item.runId ?? undefined,
            ...(item.issue
              ? {
                  issueId: item.issue.id,
                  issueIdentifier: issueIdentifier(
                    item.project.key,
                    item.issue.number,
                  ),
                  issueTitle: item.issue.title,
                }
              : {}),
          }
        : null,
    [item, pr?.base, pr?.head],
  );

  // Review progress belongs to one exact diff. A force-push or a different PR
  // invalidates every local file marker rather than carrying stale completion
  // into code the viewer has not seen.
  useEffect(() => {
    setFileReviewActive(false);
    setReviewedFiles(new Set());
  }, [item.prId, currentHeadSha]);

  // Four labels for ONE gesture (have Numo proofread): they say where
  // is the pass. The same text serves the three affordances of the same gesture —
  // the Review menu entry, the fallback button without git account, and the entry of the
  // “…” menu of the mobile —, hence the extraction: they must never say
  // different things.
  const aiReviewLabel = aiReviewActive
    ? t("numoReviewRunning")
    : reviewUpToDate
      ? t("numoReviewUpToDateShort")
      : reviewSession.run
        ? t("numoReviewRerun")
        : t("aiReview");

  // The review gesture lives in ONE card (MIN-548) — running, up to date, or
  // waiting for the ask — instead of entries buried in the header menus.
  // A review that is up to date but whose session went unreadable says
  // nothing an action could serve: no card.
  const numoReviewCard =
    !prPageContext || (reviewUpToDate && !completedReviewSessionHref)
      ? null
      : aiReviewActive
        ? {
            kind: "running" as const,
            label: aiReviewLabel,
            href: reviewSession.run
              ? `/agents?run=${encodeURIComponent(reviewSession.run.runId)}`
              : null,
            startedAt: reviewSession.run?.createdAt ?? null,
            durationMs: null,
          }
        : reviewUpToDate && completedReviewSessionHref
          ? {
              kind: "current" as const,
              label: aiReviewLabel,
              href: completedReviewSessionHref,
              startedAt: null,
              durationMs:
                reviewSession.run?.createdAt && reviewSession.run?.completedAt
                  ? Date.parse(reviewSession.run.completedAt) -
                    Date.parse(reviewSession.run.createdAt)
                  : null,
            }
          : {
              kind: "requested" as const,
              label: aiReviewLabel,
              href: null,
              startedAt: null,
              durationMs: null,
            };

  // The card reports an active or interrupted review. A completed run has
  // already posted its outcome into the PR, so the persistent banner disappears;
  // its session remains available from the PR actions instead.
  const reviewCard =
    reviewSession.run?.status === "completed" ? null : reviewSession.run;

  const act = async (
    action: "merge" | "close" | "reopen" | "ready_for_review" | "convert_to_draft",
    mergeOptions: {
      method?: MergeMethod;
      commitTitle?: string;
      commitMessage?: string;
    } = {},
  ) => {
    if (acting) return;
    const optimisticState =
      action === "merge"
        ? "merged"
        : action === "close"
          ? "closed"
          : action === "ready_for_review"
            ? "open"
            : action === "convert_to_draft"
              ? "draft"
            : pr?.draft
              ? "draft"
              : "open";
    const rollback = onOptimisticStateChange(item.prId, optimisticState);
    setActing(action);
    setConfirmAction(null);
    try {
      const result = await actOnPullRequestApi(item.prId, action, mergeOptions);
      onStateChange(item.prId, result.pr_state);
      toast.success(
        action === "merge"
          ? t("mergedToast")
          : action === "close"
            ? t("closedToast")
            : action === "reopen"
              ? t("reopenedToast")
              : action === "convert_to_draft"
                ? t("convertedToDraftToast")
                : t("readyForReviewToast"),
      );
      onRefetchList();
      await refetchPr();
    } catch (err) {
      rollback();
      onRefetchList();
      toast.error((err as Error).message);
    } finally {
      setActing(null);
    }
  };

  const openMergeConfirmation = useCallback(
    (method: MergeMethod) => {
      setConfirmAction({ kind: "merge", method });
      setMergeCommitDraftEdited(false);
      setMergeCommitDraft(
        pr
          ? defaultMergeCommitMessage({
              provider: item.provider,
              method,
              pullRequest: pr,
              commits,
              policy: mergePolicy,
            })
          : null,
      );
    },
    [commits, item.provider, mergePolicy, pr],
  );

  useEffect(() => {
    if (confirmAction?.kind !== "merge" || !pr || mergeCommitDraftEdited) return;
    setMergeCommitDraft(
      defaultMergeCommitMessage({
        provider: item.provider,
        method: confirmAction.method ?? "squash",
        pullRequest: pr,
        commits,
        policy: mergePolicy,
      }),
    );
  }, [commits, confirmAction, item.provider, mergeCommitDraftEdited, mergePolicy, pr]);

  const handleReadinessAction = async (blocker: ReadinessBlocker) => {
    if (maintenanceAction) return;
    if (blocker.action === "mark_ready") {
      await act("ready_for_review");
      return;
    }
    if (blocker.action === "approve") {
      openReview("approve");
      return;
    }
    if (blocker.action === "resolve_conversations") {
      setUnresolvedSidebarOpen(true);
      return;
    }
    setMaintenanceAction(blocker.action);
    try {
      if (blocker.action === "update_branch") {
        await maintainPullRequestApi(item.prId, "update_branch");
        toast.success(t("branchUpdatedToast"));
      } else if (blocker.action === "rerun_checks") {
        const rerunnable = findRerunnableChecks(checks?.checks, blocker);
        if (rerunnable.length === 0) return;
        await Promise.all(
          rerunnable.map((check) =>
            maintainPullRequestApi(item.prId, "rerun_check", {
              rerunRef: check.rerunRef,
            }),
          ),
        );
        toast.success(t("checksRerunToast"));
      } else if (blocker.action === "enable_auto_merge") {
        await maintainPullRequestApi(item.prId, "enable_auto_merge");
      }
      await refetchPr();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setMaintenanceAction(null);
    }
  };

  const toggleAutoMerge = async (enable: boolean) => {
    if (maintenanceAction) return;
    setMaintenanceAction("enable_auto_merge");
    try {
      await maintainPullRequestApi(
        item.prId,
        enable ? "enable_auto_merge" : "disable_auto_merge",
      );
      toast.success(
        enable ? t("autoMergeEnabledToast") : t("autoMergeDisabledToast"),
      );
      await refetchPr();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setMaintenanceAction(null);
    }
  };

  const handleRerunCheck = async (check: PullRequestCheck) => {
    if (!check.rerunRef || maintenanceAction) return;
    setMaintenanceAction("rerun_checks");
    try {
      await maintainPullRequestApi(item.prId, "rerun_check", {
        rerunRef: check.rerunRef,
      });
      toast.success(t("checksRerunToast"));
      await refetchPr();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setMaintenanceAction(null);
    }
  };

  const saveTitle = async () => {
    const title = titleDraft.trim();
    if (!title || maintenanceAction) return;
    setMaintenanceAction("open_forge");
    try {
      await maintainPullRequestApi(item.prId, "update_title", { title });
      toast.success(t("prTitleUpdatedToast"));
      setEditingTitle(false);
      onRefetchList();
      await refetchPr();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setMaintenanceAction(null);
    }
  };

  const canActOnBlocker = (blocker: ReadinessBlocker): boolean => {
    if (blocker.action === "mark_ready" || blocker.action === "update_branch") return canWrite;
    if (blocker.action === "approve") return canComment;
    if (blocker.action === "resolve_conversations") return unresolvedThreads.length > 0;
    if (blocker.action === "rerun_checks") {
      return !!canWrite && findRerunnableChecks(checks?.checks, blocker).length > 0;
    }
    if (blocker.action === "enable_auto_merge") return !!canWrite;
    return false;
  };

  const selectReviewVerdict = (verdict: ReviewVerdict) => {
    setReviewVerdict(verdict);
    setReviewMode("write");
    setRelaunch(verdict === "request_changes" && canRelaunch);
  };

  const resetReviewDraft = () => {
    setReviewMessage("");
    setReviewMode("write");
  };

  const openReview = (verdict: ReviewVerdict) => {
    resetReviewDraft();
    setReviewFromFiles(false);
    selectReviewVerdict(verdict);
    setReviewDialogOpen(true);
  };

  const startFileReview = () => {
    setFileReviewActive(true);
    setTab("files");
  };

  const finishFileReview = () => {
    resetReviewDraft();
    setReviewVerdict(null);
    setReviewFromFiles(true);
    setReviewDialogOpen(true);
  };

  const openFeedbackAgent = useCallback((prompt: string) => {
    setReviewVerdict("request_changes");
    setReviewDialogOpen(true);
    setReviewFromFiles(false);
    setReviewMode("findings");
    setReviewMessage(prompt);
    setRelaunch(true);
  }, []);

  /**
   * Mode toggle. The “correct remarks” prompt is PRE-WRITTEN but
   * remains editable: it is a starting point, not a form. We don't crush it
   * that if the person has not written anything else — retracing their steps should not
   * erase its prompt.
   */
  const switchReviewMode = (next: "write" | "findings") => {
    setReviewMode(next);
    if (next === "findings") {
      // Correcting the remarks necessarily means making Numo work.
      setRelaunch(true);
      if (!reviewMessage.trim()) setReviewMessage(t("reviewFindingsPrompt"));
    } else if (reviewMessage.trim() === t("reviewFindingsPrompt")) {
      setReviewMessage("");
    }
  };

  // “Correct remarks” mode: no verdict, therefore no git identity
  // required — this is what makes the button usable without a connected account. In
  // “write” mode, the verdict only goes out if you have an account to sign it.
  const postVerdict = reviewMode === "write" && !!canComment;
  // Relaunch is the only possible effect when no verdict is issued: without
  // for her, the gesture would do nothing at all.
  const relaunching = canRelaunch && (reviewMode === "findings" || relaunch) && !item.busyRunId;
  // Neither verdict to publish, nor Numo to launch: the button has NOTHING to do (no
  // git account, and a PR that Numo never touched — or works
  // Already). We deactivate it rather than letting go of a request that the
  // serveur refusera en `noEffect`.
  const reviewHasNoEffect =
    reviewVerdict === "request_changes" && !postVerdict && !relaunching;
  // What prevents the review from leaving, and its wording: the button on the foot of
  // dialog and the shortcut ⌘/Ctrl+Enter of the field read both — otherwise the
  // button would send what the button refuses.
  const reviewSubmitDisabled =
    submitting ||
    !reviewVerdict ||
    reviewUploads.uploading ||
    reviewHasNoEffect ||
    (!reviewMessage.trim() && reviewVerdict !== "approve");
  const reviewSubmitLabel =
    reviewFromFiles
      ? t("reviewSubmit")
      : reviewMode === "findings"
        ? t("reviewFixSubmit")
        : reviewVerdict === "request_changes" && relaunching
          ? t("sendToNumo")
          : t("reviewSubmit");

  const submitReview = async () => {
    if (!reviewVerdict || submitting || reviewUploads.uploading || reviewHasNoEffect) return;
    const message = reviewMessage.trim();
    // Approving without a word is legitimate; comment or request changes
    // without saying anything is not (and both providers reject an empty body).
    if (!message && reviewVerdict !== "approve") return;
    setSubmitting(true);
    try {
      // A Numo-only fix has no forge-side effect. Sending it through the
      // review endpoint would be rejected as `noEffect` before this component
      // can hand the request to the common conversation below.
      const result = !postVerdict && relaunching
        ? { published: "none" as const }
        : await submitPullRequestReviewApi(item.prId, {
            verdict: reviewVerdict,
            message,
            relaunch: false,
            postVerdict,
          });
      if (
        relaunching &&
        reviewVerdict === "request_changes" &&
        prPageContext
      ) {
        openIntent({
          source: "pull_request",
          action: "fix",
          projectId: item.project?.id ?? null,
          prompt: message,
          pageContext: prPageContext,
        });
      }
      // Three outcomes, three messages: the verdict has passed, the forge has folded it
      // in comments (an App cannot approve its own PR — say so,
      // rather than suggesting a green pellet), or there was none
      // not to give and it's Numo who goes to work.
      toast.success(
        result.published === "none"
          ? t("sendToNumo")
          : result.published === "comment"
            ? t("selfReviewBlocked")
            : t("reviewSubmittedToast"),
      );
      setReviewVerdict(null);
      setReviewDialogOpen(false);
      setReviewMessage("");
      if (reviewFromFiles) {
        setFileReviewActive(false);
        setReviewedFiles(new Set());
        setReviewFromFiles(false);
      }
      onRefetchList(); // brings up a possible new active run → polling the list.
      await Promise.all([refetchComments(), refetchPr()]);
    } catch (err) {
      toast.error(agentErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  /** Open the confirmation for a common Numo PR-review intent. */
  const openAiReviewDialog = () => setAiReviewDialog(true);

  /** Preserve the selected PR/ref while handing the review request to Numo. */
  const startAiReview = () => {
    if (!prPageContext) return;
    setAiReviewDialog(false);
    openIntent({
      source: "pull_request",
      action: "review",
      projectId: item.project?.id ?? null,
      prompt: `${t("aiReview")}: ${t("numoReviewDialogDescription")}`,
      pageContext: prPageContext,
    });
  };

  // The PR thread is FLAT on the GitHub side (endpoint issues/{n}/comments: none
  // in_reply_to — only review comments anchored to the code are threaded).
  // “Reply” therefore quotes the message in the bottom composer, as does the
  // “Quote reply” from GitHub, and mentions its author to keep the thread readable.
  /**
   * Is this message from NUMO? (MIN-162)
   *
   * Two benchmarks, and the second catches up with what the first doesn't see:
   * · the account under which he writes at the forge (`viewer.numoLogin`) —
   * complete, but GitHub only: on the GitLab side it has no identity of its own
   * (MIN-146), his gestures start from the account of who linked the deposit — and a
   * Numo's message then reads as a message from that person.
   */
  const isNumoComment = (login?: string | null): boolean =>
    !!viewer?.numoLogin && login === viewer.numoLogin;

  /**
   * “Quote” — and, on a message from Numo, **reply to him**.
   *
   * Quoting someone mentions it, to keep the thread readable: that's what
   * made the GitHub “Quote reply”. On a message from Numo, mention his
   * bot account wouldn't lead anywhere — a `@minddy-app[bot]` won't wake you up
   * person. It is `@Numo` that we ask: the mention that minddy treats herself,
   * the one who restarts the pass. Responding to Numo is therefore reminding him, without
   * having to know that you have to write it down.
   *
   * The quote is enough to say what we are responding to: since MIN-168, rereading is
   * a SESSION that reads the entire thread (and keeps its own in context) — the id of the
   * quoted message, which the old pass received separately, no longer taught anything.
   */
  const quoteReply = (body: string, login?: string | null) => {
    const quoted = body
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const numo = isNumoComment(login);
    const mention = numo ? "@Numo " : login ? `@${login} ` : "";
    setCommentBody((d) => `${d.trim() ? `${d.trimEnd()}\n\n` : ""}${quoted}\n\n${mention}`);
    // The composer is no longer a `<textarea>` but a field with mentions (MIN-162):
    // the cursor does not land on `setSelectionRange` but on this signal, which
    // the field reads AFTER resting its contents.
    setQuoteFocus((n) => n + 1);
  };

  const submitComment = async () => {
    const body = commentBody.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const { review } = await postPullRequestCommentApi(item.prId, body);
      setCommentBody("");
      await refetchComments();
      // A PR @Numo mention is admitted as a common conversation on the server.
      // Open that exact durable conversation instead of looking for a worker
      // review session that no longer owns the user-facing request.
      if (review) router.push(review.detailHref);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPosting(false);
    }
  };

  // The name of this page is the PR ID — not the ticket ID, which
  // is only one relation and can be read to its right. `pr_url` comes from the list,
  // `pr.url` of the forge: the identifier IS the link to the forge, which
  // replaces the “PR #30 ↗” which was lying under the title.
  const identifier = prIdentifier(item.provider, item.pr_number);
  const linkedIssue =
    item.issue && item.project
      ? issueIdentifier(item.project.key, item.issue.number)
      : null;
  const forgeUrl = pr?.url ?? item.pr_url;

  // The weight of PR, at a glance: GitHub puts it next to the title, and it's
  // the first question we ask ourselves before opening the Files tab.
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);
  const reviewedCount = reviewedFileCount(files, reviewedFiles);

  // The list knows the author (column `author_login`); the forge confirms it.
  // She wins as soon as she responds — same arbitration as for the state.
  const author = pr?.user ?? item.author;

  /**
   * The merge line reads left to right: the base branch the PR lands in,
   * the diff it carries, the head branch it comes from. GitHub poses the
   * same reading under the title; the branches render in code pills so a
   * `work/min-542-something` never reads like prose.
   */
  const baseBranch = pr?.base ?? null;
  const headBranch = pr?.head ?? item.head_branch ?? null;

  // GitHub body of the PR, without the auto suffix “🤖 Generated by agent numo…”
  // (redundant with the “Generated by Numo” badge).
  const prDescription = (pr?.body ?? "").replace(/\n*🤖[^\n]*$/u, "").trim();

  // The full thread: messages AND activity, in the order everything happened.
  const feed = buildFeed(comments, timeline, reviewComments, commits);
  // The tab counter counts EVERYTHING that happened (MIN-548): messages,
  // reviews, and the activity lines that also carry information.
  const conversationCount = feed.length;
  const feedbackContext = useMemo(
    () => ({
      number: item.pr_number,
      title: pr?.title ?? item.title ?? item.issue?.title ?? identifier,
      url: pr?.url ?? item.pr_url,
      base: pr?.base ?? null,
      head: pr?.head ?? item.head_branch,
    }),
    [identifier, item.head_branch, item.issue?.title, item.pr_number, item.pr_url, item.title, pr],
  );
  const copyFeedbackThreadPrompt = useCallback(
    async (thread: (typeof unresolvedThreads)[number]) => {
      try {
        await navigator.clipboard.writeText(
          buildPullRequestFeedbackPrompt(feedbackContext, [thread]),
        );
        toast.success(t("unresolvedPromptCopied"));
      } catch {
        toast.error(t("unresolvedPromptCopyFailed"));
      }
    },
    [feedbackContext, t],
  );
  const reviewThreadActions = useMemo(
    () => ({
      copyPrompt: (thread: (typeof unresolvedThreads)[number]) => {
        void copyFeedbackThreadPrompt(thread);
      },
      launchNumo:
        canRelaunch && !item.busyRunId
          ? (thread: (typeof unresolvedThreads)[number]) => {
              setUnresolvedSidebarOpen(false);
              openFeedbackAgent(
                buildPullRequestFeedbackPrompt(feedbackContext, [thread]),
              );
            }
          : undefined,
    }),
    [
      canRelaunch,
      copyFeedbackThreadPrompt,
      feedbackContext,
      item.busyRunId,
      openFeedbackAgent,
    ],
  );

  return (
    // The envelope tells the WHOLE panel — body, thread, activity, comments of
    // line, composers — which PR he is talking about: which proxy to go through to
    // display an image of the forge, and which routes to ask for accounts
    // mentionable and hosting an attachment (MIN-162).
    <PrEndpointProvider
      endpoint={prEndpoint(item.prId)}
      replyingUser={
        viewer?.login
          ? { login: viewer.login, avatar_url: viewer.avatarUrl ?? null }
          : null
      }
      reviewThreadActions={reviewThreadActions}
    >
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: back (mobile) · identifier · actions */}
      {/* Header WITHOUT border: it's the fade of the thread that says it continues
          above, and a separate bar would cut it off from what it covers (even
          party than the agent conversation). */}
      <AppContentHeader contentClassName="gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("backToList")}
          className="md:hidden"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
        {/* The project orb opens the header, like that of a conversation
            the agent: the column no longer says the project line by line (it is
            written once, on the header of his accordion), and the detail is
            the place where we want to know which repository we are talking about. */}
        {item.project ? (
          <ProjectOrb
            seed={projectOrbSeed(item.project)}
            iconUrl={item.project.icon_url}
            className="size-4 shrink-0"
          />
        ) : null}
        <span className="flex min-w-0 items-center gap-1 font-mono text-sm">
          {forgeUrl ? (
            <a
              href={forgeUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-foreground outline-none hover:underline"
            >
              {identifier}
            </a>
          ) : (
            <span className="shrink-0 text-foreground">{identifier}</span>
          )}
          {linkedIssue ? (
            // The link icon makes this a navigable association, not a dependency.
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    if (item.issue && item.project) onOpenIssue(item.issue.id, item.project.id);
                  }}
                  className="flex min-w-0 items-center gap-1 text-muted-foreground outline-none hover:text-foreground hover:underline"
                >
                  <Link2
                    data-testid="pr-issue-link-icon"
                    className="size-3.5 shrink-0"
                    aria-hidden
                  />
                  <span className="truncate">{linkedIssue}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("linkedIssue")}</TooltipContent>
            </Tooltip>
          ) : item.project ? (
            // Unattached: this is a NORMAL STATE since MIN-143 (the link comes
            // of a `MIN-42` convention in the branch, title or a line
            // Fixed — not a guess). The fact remains that the convention fails, and
            // that nothing knew how to place the link afterwards: the selector
            // takes the exact place of the missing ticket (MIN-163).
            <PrLinkIssue
              prId={item.prId}
              prState={item.pr_state}
              projectId={item.project.id}
              projectKey={item.project.key}
              onLinked={() => {
                onRefetchList();
                void refetchPr();
              }}
            />
          ) : (
            // No project resolved for this repository: there is no scope of
            // tickets to offer. We tell the state rather than offering an empty menu.
            <span className="font-sans text-xs text-muted-foreground/70">
              {t("noLinkedIssue")}
            </span>
          )}
        </span>
        {isWorking ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner />
            {t("numoWorking")}
          </span>
        ) : null}

        {isTerminal ? (
          // End of line of a completed PR: the only gesture left to it — reopen,
          // without confirmation, it does not destroy anything and the button next to it closes it
          // — then its STATE, last. The badge closes the line in both cases,
          // merged (nothing before it) as closed (the button before it): it is
          // always in the same place that we read what became of her.
          <div className="ml-auto flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  data-testid="pr-more-actions"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("moreActions")}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {forgeUrl ? (
                  <DropdownMenuItem asChild>
                    <a
                      href={forgeUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink />
                      {t(item.provider === "gitlab" ? "openOnGitlab" : "openOnGithub")}
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {canWrite ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setTitleDraft(pr?.title ?? item.title ?? "");
                      setEditingTitle(true);
                    }}
                  >
                    <Pencil />
                    {t("renamePr")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            {canReopen ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void act("reopen")}
                disabled={!!acting}
              >
                {acting === "reopen" ? <Spinner /> : <RotateCcw />}
                {t("reopen")}
              </Button>
            ) : null}
            <PrStateBadge state={badgeState} icon />
          </div>
        ) : (
          // Under `lg`, secondary actions move into the overflow menu. The
          // remaining actions stay on the shared 60 px header line; if a long
          // translation still exceeds the pane, the header remains horizontally
          // reachable instead of growing vertically.
          <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5">
            {/* ── Wide screen: each gesture has its name ─────────────────── */}
            <div className="hidden items-center gap-1.5 2xl:flex">
              {/* Request changes can launch Numo work and does not require a
                  connected forge identity, so it remains directly available. */}
              <Button variant="outline" size="sm" onClick={() => openReview("request_changes")}>
                <NumoIcon animated={false} />
                {t("reviewRequestChanges")}
              </Button>

              {/* Approve and comment require a forge identity. Numo review does
                  not, so it becomes a direct button when it is the only action. */}
              {canComment ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {aiReviewActive ? <Spinner /> : null}
                      {t("review")}
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => openReview("approve")}>
                      <Check />
                      {t("reviewApprove")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openReview("comment")}>
                      <MessageSquare />
                      {t("reviewComment")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}

              {canWrite ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction({ kind: "close" })}
                  disabled={!!acting || isWorking}
                >
                  {acting === "close" ? <Spinner /> : <X />}
                  {t("closePullRequest")}
                </Button>
              ) : null}
            </div>

            {/* On narrow screens, actions stay available in one unlabeled menu.
                Numo work comes first, human review verdicts form the second
                section, and the destructive close action stays isolated last. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  data-testid="pr-more-actions"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("moreActions")}
                >
                  {aiReviewActive ? <Spinner /> : <MoreHorizontal />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {forgeUrl ? (
                  <DropdownMenuItem asChild>
                    <a
                      href={forgeUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink />
                      {t(item.provider === "gitlab" ? "openOnGitlab" : "openOnGithub")}
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {canWrite ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setTitleDraft(pr?.title ?? item.title ?? "");
                      setEditingTitle(true);
                    }}
                  >
                    <Pencil />
                    {t("renamePr")}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid="pr-action-numo-request"
                  className="2xl:hidden"
                  onSelect={() => openReview("request_changes")}
                >
                  <NumoIcon animated={false} />
                  {t("reviewRequestChanges")}
                </DropdownMenuItem>
                {canComment ? (
                  <>
                    <DropdownMenuSeparator className="2xl:hidden" />
                    <DropdownMenuItem
                      data-testid="pr-action-start-review"
                      className="2xl:hidden"
                      onSelect={startFileReview}
                    >
                      <Eye />
                      {t("reviewStart")}
                    </DropdownMenuItem>
                  </>
                ) : null}
                {canWrite ? (
                  <>
                    <DropdownMenuSeparator className="2xl:hidden" />
                    {!isDraft ? (
                      <DropdownMenuItem
                        data-testid="pr-action-convert-to-draft"
                        disabled={!!acting || isWorking}
                        onSelect={() => void act("convert_to_draft")}
                      >
                        {acting === "convert_to_draft" ? <Spinner /> : <GitPullRequestDraft />}
                        {t("convertToDraft")}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      data-testid="pr-action-close"
                      className="2xl:hidden"
                      variant="destructive"
                      disabled={!!acting || isWorking}
                      onSelect={() => setConfirmAction({ kind: "close" })}
                    >
                      <X />
                      {t("closePullRequest")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Open state and merge state read side by side, AFTER the more
                menu: first what we can do, then what the PR is, then what
                still stands between it and the merge. */}
            <PrStateBadge state={badgeState} icon />
            {isDraft && canWrite ? (
              <Button
                data-testid="pr-ready-for-review"
                size="sm"
                variant="outline"
                disabled={!!acting || isWorking}
                onClick={() => void act("ready_for_review")}
              >
                {acting === "ready_for_review" ? <Spinner /> : <GitPullRequest />}
                {t("openPullRequest")}
              </Button>
            ) : effectiveReadiness ? (
              <PrReadinessControl
                readiness={effectiveReadiness}
                providerName={REPO_PROVIDERS[item.provider].displayName}
                canAct={canActOnBlocker}
                acting={maintenanceAction}
                onAction={(blocker) => void handleReadinessAction(blocker)}
                canMerge={!!canWrite}
                merging={acting === "merge" || isWorking}
                onMerge={openMergeConfirmation}
                mergeFlowActive={!!pr?.mergeFlowActive}
                autoMergeAllowed={mergePolicy?.autoMergeAllowed ?? null}
                autoMerging={maintenanceAction === "enable_auto_merge"}
                onToggleAutoMerge={(enable) => void toggleAutoMerge(enable)}
              />
            ) : (
              <PrReadinessBadge readiness={null} />
            )}
          </div>
        )}
      </AppContentHeader>

      {/* Fade OFF under Files tab (MIN-182). A faded mask
          everything it contains, including sticky elements: the header of
          diff file should otherwise stop 2rem lower to remain clear,
          and a header that floats 32 px from the edge is seen. The fade says “there is
          text above” — the sticky header says it better, and naming the
          file. Under the other two tabs it remains, there is nothing sticking
          to protect.

          `onScroll` continues to run: the measure costs nothing and the fade
          just returns, without missed transitions, as soon as you change tabs. */}
      {/* The scroll host is wrapped in a relative box so the floating
          back-to-top of the Files tab can anchor to the viewport of the
          scroll container instead of the page. */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={(el) => {
            feedFade.ref(el);
            scrollContainerRef.current = el;
          }}
          onScroll={(e) => {
            feedFade.scrollProps.onScroll();
            setScrolledDown(e.currentTarget.scrollTop > 600);
          }}
          style={tab === "files" ? undefined : feedFade.scrollProps.style}
          // The VERTICAL padding has gone down a notch, on the envelope (MIN-182).
          // Measured: `position: sticky` fits on the CONTENT of the container
          // scrolling, not on its edge — a `py-6` here stopped the header from
          // 24 px file too low, and `scroll-padding-top: 0` changes nothing.
          // When lowered, it scrolls with the content and the header sticks to the banner.
          className="h-full overflow-y-auto px-4 md:px-6"
        >
        <div className="mx-auto flex max-w-3xl flex-col gap-6 py-6">
          {/* PR title + meta. The TITLE of the pull request, not that of the
              ticket: since MIN-143 they no longer come in pairs, and a PR
              human may have none. (Numo names his
              “MIN-42: <titre du ticket>” — the display does not change for them.) */}
          <div className="flex flex-col gap-2">
            <h1 className="min-w-0 flex-1 font-display text-2xl leading-tight font-semibold break-words">
              {pr?.title ?? item.title ?? item.issue?.title ?? identifier}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
              {/* Author first — avatar and name, like a comment header. A Numo
                  PR never shows the forge App bot: Numo takes the author seat. */}
              {author ? (
                <span className="inline-flex items-center gap-1.5">
                  {item.runId ? (
                    <NumoIcon animated={false} className="size-4" />
                  ) : (
                    <ForgeUserAvatar user={author} className="size-4" />
                  )}
                  <span className="font-medium text-foreground">
                    {item.runId
                      ? t("numoAuthor")
                      : parseForgeLogin(author.login).name}
                  </span>
                  {!item.runId && parseForgeLogin(author.login).isBot ? (
                    <BotBadge />
                  ) : null}
                </span>
              ) : null}
              {/* The two branches, in code pills: base — head, the merge
                  direction carried by the arrow between them. */}
              {baseBranch ? (
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                  {baseBranch}
                </code>
              ) : null}
              {/* The diff in one number, between the two branches — the merge
                  line reads left to right: from base, +adds −dels, toward head.
                  Mute until files have answered: “+0 −0” would read as an
                  empty PR. */}
              {files.length > 0 ? (
                <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                  <span className="text-green-700 dark:text-green-500">
                    +{format.number(additions)}
                  </span>
                  <span className="text-red-700 dark:text-red-500">
                    −{format.number(deletions)}
                  </span>
                </span>
              ) : null}
              {baseBranch && headBranch ? (
                <ArrowLeft className="size-3.5" aria-hidden />
              ) : null}
              {headBranch ? (
                <span className="inline-flex items-center gap-0.5">
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                    {headBranch}
                  </code>
                  <CopyBranchButton value={headBranch} />
                </span>
              ) : null}
            </div>
          </div>

          {/* The only place to say which Git account is in use (MIN-144).
              It stays silent when everything is configured correctly. */}
          {!loading ? <PrViewerCallout viewer={viewer} repoUrl={pr?.url} /> : null}

          {/* Quick-glance cards: every condition that stands between this PR
              and the merge, each in its own color, each with its own quick
              fix. The conversations card opens the same side panel that the
              old workspace bar did. */}
          <PrUnresolvedConversations
            endpoint={prEndpoint(item.prId)}
            context={feedbackContext}
            threads={unresolvedThreads}
            canComment={!!canComment}
            canResolve={!!canWrite}
            canLaunch={canRelaunch && !item.busyRunId}
            open={unresolvedSidebarOpen}
            onOpenChange={setUnresolvedSidebarOpen}
            onLaunch={openFeedbackAgent}
            onThreadChanged={refreshReviewState}
            onResolutionChanged={refetchPr}
            showBar={false}
          />

          <PrStatusCards
            readiness={effectiveReadiness}
            checks={checks}
            provider={item.provider}
            deploymentUrl={deploymentUrl}
            deploymentDurationMs={deploymentDurationMs}
            unresolvedThreads={unresolvedThreads}
            canAct={canActOnBlocker}
            acting={maintenanceAction}
            onAction={(blocker) => void handleReadinessAction(blocker)}
            onOpenConversations={() => setUnresolvedSidebarOpen(true)}
            onOpenReviewApprove={() => openReview("approve")}
            onStartFileReview={startFileReview}
            onRerunCheck={(check) => void handleRerunCheck(check)}
            numoReview={numoReviewCard}
            onRequestReview={openAiReviewDialog}
          />

          {/* GitHub style tabs: the thread on one side, the code on the other. */}
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as PullRequestDetailTab);
              // The floating back-to-top follows the scroll position of the
              // Files tab only; a fresh tab must not inherit a stale flag.
              setScrolledDown(false);
            }}
          >
            <TabsList variant="line" className={TAB_LIST_DENSE}>
              <TabsTrigger value="activity" className={cn(TAB_TRIGGER_DENSE, "gap-1.5")}>
                {t("tabActivity")}
                {conversationCount > 0 ? (
                  <span className="text-xs text-muted-foreground">{conversationCount}</span>
                ) : null}
              </TabsTrigger>
              {/* Commits BEFORE files, like on GitHub: we read what
                  dials the PR before entering the code it changes. */}
              <TabsTrigger value="commits" className={cn(TAB_TRIGGER_DENSE, "gap-1.5")}>
                {t("tabCommits")}
                {commits.length > 0 ? (
                  <span className="text-xs text-muted-foreground">{commits.length}</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="files" className={cn(TAB_TRIGGER_DENSE, "gap-1.5")}>
                {t("tabFiles")}
                {files.length > 0 ? (
                  <span className="text-xs text-muted-foreground">{files.length}</span>
                ) : null}
              </TabsTrigger>
            </TabsList>

            {/* Thread: PR description opens discussion, comments
                GitHub follow, compose closes. */}
            <TabsContent value="activity" className="mt-4 flex flex-col gap-3">
              {loading || commentsLoading ? (
                <Skeleton className="h-16 rounded-lg" />
              ) : !prDescription && feed.length === 0 && !reviewCard ? (
                <p className="text-sm text-muted-foreground">{t("noComments")}</p>
              ) : (
                // MIN-548: the activity is a plain stack of cards and lines —
                // no vertical rail, no markers. The one line of an event reads
                // from left to right, and a card is a card, like the ticket
                // timeline.
                <div data-testid="pr-activity-timeline" className="flex flex-col gap-3">
                  {prDescription ? (
                    <ThreadComment
                      // The body of the PR is not a commentary, but it
                      // reacts like one: the server translates this zero into the
                      // subject each forge expects.
                      endpoint={prEndpoint(item.prId)}
                      commentId={PR_BODY_COMMENT_ID}
                      user={pr?.user ?? null}
                      createdAt={pr?.createdAt ?? null}
                      updatedAt={pr?.updatedAt ?? null}
                      body={prDescription}
                      // Like on the forge: the AUTHOR rewrites the
                      // description — Numo's PRs stay read-only, the agent
                      // retells them himself.
                      canEdit={
                        canComment &&
                        !!viewer?.login &&
                        !!pr?.user?.login &&
                        pr.user.login.toLowerCase() === viewer.login.toLowerCase() &&
                        !item.runId
                      }
                      onSave={async (next) => {
                        await maintainPullRequestApi(item.prId, "update_body", {
                          body: next,
                        });
                      }}
                      onEdited={() => void refetchPr()}
                      // Quote feeds the bottom composer: without a git account it
                      // there is none, and the gesture would lead nowhere.
                      onQuoteReply={
                        canComment
                          ? () => quoteReply(prDescription, pr?.user?.login)
                          : undefined
                      }
                      reactions={threadReactions}
                      forceBot={!!item.runId}
                    />
                  ) : null}
                  {feed.map((entry) => {
                    if (entry.kind === "event") {
                      return <PrTimelineRow key={entry.key} event={entry.event} />;
                    }
                    if (entry.kind === "review") {
                      return (
                        <PrTimelineReview
                          key={entry.key}
                          event={entry.event}
                          comments={entry.comments}
                          endpoint={prEndpoint(item.prId)}
                          threadStates={reviewThreads}
                          canComment={!!canComment}
                          canResolve={!!canWrite}
                          onChanged={refreshReviewState}
                          onResolutionChanged={refetchPr}
                        />
                      );
                    }
                    const c = entry.comment;
                    // Editing stays on the person's OWN message (MIN-548):
                    // same login at the forge, a connected account, and never
                    // a bot's — Numo's messages are read-only.
                    // Forge logins are CASE-INSENSITIVE (GitHub normalizes
                    // nothing in its payloads): compare lowercased, or an
                    // author whose login capitalizes differently would lose
                    // the edit gesture on their own words.
                    const canEdit =
                      canComment &&
                      !!viewer?.login &&
                      c.user?.login?.toLowerCase() === viewer.login.toLowerCase() &&
                      !isNumoComment(c.user?.login);
                    return (
                      <ThreadComment
                        key={entry.key}
                        endpoint={prEndpoint(item.prId)}
                        commentId={c.id}
                        user={c.user}
                        createdAt={c.created_at}
                        updatedAt={c.updated_at}
                        body={c.body}
                        canEdit={canEdit}
                        onEdited={() => void refetchComments()}
                        onQuoteReply={
                          canComment
                            ? () => quoteReply(c.body ?? "", c.user?.login)
                            : undefined
                        }
                        quotingNumo={isNumoComment(c.user?.login)}
                        forceBot={isNumoComment(c.user?.login)}
                        reactions={threadReactions}
                      />
                    );
                  })}
                  {/* The proofreading session, where its verdict falls —
                      and clickable: this is how we will see what the agent has
                      read, and answered. */}
                  {reviewCard ? <PrReviewCard run={reviewCard} /> : null}
                </div>
              )}

              {canComment ? (
                <div data-testid="pr-comment-composer-region" className="pt-1">
                  <PrCommentComposer
                    endpoint={prEndpoint(item.prId)}
                    value={commentBody}
                    onChange={setCommentBody}
                    onSubmit={() => void submitComment()}
                    posting={posting}
                    placeholder={t("commentPlaceholder")}
                    submitLabel={t("postComment")}
                    focusSignal={quoteFocus}
                  />
                </div>
              ) : null}

            </TabsContent>

            <TabsContent value="commits" className="mt-4">
              <PrCommits
                prId={item.prId}
                commits={commits}
                truncated={commitsTruncated}
                loading={commitsLoading}
                provider={item.provider}
              />
            </TabsContent>

            <TabsContent value="files" className="mt-4">
              {loading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-40 rounded-md" />
                </div>
              ) : pr ? (
                <div className="flex flex-col gap-3">
                  {/* MIN-548: the review mode lives INSIDE the diff toolbar —
                      one single line under the tab, with the file count, the
                      display switches and the review toggle. */}
                  <PrDiff
                    files={files}
                    endpoint={prEndpoint(item.prId)}
                    prUrl={pr.url}
                    provider={item.provider}
                    // Two distinct rights (MIN-144): comment on a line
                    // request `read`, resolve a thread is a write to the
                    // deposit. Confusing them would offer “Solve” for a 403.
                    readOnly={!canComment}
                    reviewMode={fileReviewActive}
                    reviewedFiles={reviewedFiles}
                    onFileReviewedChange={(path, reviewed) =>
                      setReviewedFiles((current) => setFileReviewed(current, path, reviewed))
                    }
                    canResolve={canWrite}
                    reviewComments={reviewComments}
                    reviewThreads={reviewThreads}
                    reviewReactions={reviewReactions}
                    onCommentPosted={refreshReviewState}
                    onThreadResolved={refetchPr}
                    reviewControls={
                      canComment ? (
                        <div data-testid="pr-file-review-toolbar" className="flex items-center gap-2">
                          {fileReviewActive ? (
                            <span className="text-xs text-muted-foreground">
                              {t("reviewFileProgress", {
                                reviewed: reviewedCount,
                                total: files.length,
                              })}
                            </span>
                          ) : null}
                          <Button
                            data-testid={fileReviewActive ? "pr-finish-review" : "pr-start-review"}
                            variant={fileReviewActive ? "default" : "outline"}
                            size="sm"
                            onClick={fileReviewActive ? finishFileReview : startFileReview}
                          >
                            {fileReviewActive ? <Check /> : <Eye />}
                            {t(fileReviewActive ? "reviewFinish" : "reviewStart")}
                          </Button>
                        </div>
                      ) : undefined
                    }
                  />
                  {fileReviewActive && canComment ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5">
                      <span className="text-xs text-muted-foreground">
                        {t("reviewFileProgress", {
                          reviewed: reviewedCount,
                          total: files.length,
                        })}
                      </span>
                      <Button
                        data-testid="pr-finish-review-bottom"
                        size="sm"
                        onClick={finishFileReview}
                      >
                        <Check />
                        {t("reviewFinish")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("prUnavailable")}</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
        </div>

        {/* The diff of a big PR scrolls far: one floating gesture brings back
            the toolbar and the file tree, without hunting for the wheel. */}
        {tab === "files" && scrolledDown ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("scrollToTop")}
            className="absolute bottom-4 right-4 z-20 rounded-full border border-border bg-card text-muted-foreground shadow-md hover:text-foreground md:right-6"
            onClick={() =>
              scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" })
            }
          >
            <ArrowUp className="size-4" />
          </Button>
        ) : null}
      </div>

      <Dialog open={editingTitle} onOpenChange={(open) => !maintenanceAction && setEditingTitle(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editPrTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("editPrTitleHint", { provider: REPO_PROVIDERS[item.provider].displayName })}
          </p>
          <input
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            maxLength={256}
            autoFocus
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onKeyDown={(event) => {
              if (event.key === "Enter" && titleDraft.trim()) void saveTitle();
            }}
          />
          <DialogFooter>
            <Button variant="outline" disabled={!!maintenanceAction} onClick={() => setEditingTitle(false)}>
              {t("cancel")}
            </Button>
            <Button disabled={!!maintenanceAction || !titleDraft.trim()} onClick={() => void saveTitle()}>
              {maintenanceAction ? <Spinner /> : <Pencil />}
              {t("savePrTitle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation fusionner / refuser */}
      <Dialog
        open={!!confirmAction}
        onOpenChange={(next) => {
          if (!next && !acting) {
            setConfirmAction(null);
            setMergeCommitDraft(null);
            setMergeCommitDraftEdited(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.kind === "merge" ? t("confirmMergeTitle") : t("confirmCloseTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmAction?.kind === "merge"
              ? t("confirmMergeDescription")
              : t("confirmCloseDescription")}
          </p>
          {confirmAction?.kind === "merge" && mergeCommitDraft ? (
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                {t("mergeCommitTitle")}
                <input
                  data-testid="pr-merge-commit-title"
                  value={mergeCommitDraft.title}
                  maxLength={256}
                  onChange={(event) => {
                    setMergeCommitDraftEdited(true);
                    setMergeCommitDraft((current) =>
                      current ? { ...current, title: event.target.value } : current,
                    );
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                {t("mergeCommitMessage")}
                <Textarea
                  data-testid="pr-merge-commit-message"
                  value={mergeCommitDraft.message}
                  rows={5}
                  maxLength={65_536}
                  onChange={(event) => {
                    setMergeCommitDraftEdited(true);
                    setMergeCommitDraft((current) =>
                      current ? { ...current, message: event.target.value } : current,
                    );
                  }}
                  className="max-h-44 min-h-28 resize-y overflow-y-auto font-mono text-xs font-normal"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                {t("mergeCommitDefaultsHint", {
                  provider: REPO_PROVIDERS[item.provider].displayName,
                })}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={!!acting} onClick={() => setConfirmAction(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant={confirmAction?.kind === "close" ? "destructive" : "default"}
              disabled={
                !!acting ||
                (confirmAction?.kind === "merge" &&
                  !!mergeCommitDraft &&
                  !mergeCommitDraft.title.trim())
              }
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.kind === "merge") {
                  const customMergeMessage =
                    mergeCommitDraft &&
                    shouldSubmitCustomMergeMessage(
                      item.provider,
                      mergeCommitDraftEdited,
                    )
                      ? mergeCommitDraft
                      : null;
                  void act("merge", {
                    method: confirmAction.method,
                    ...(customMergeMessage
                      ? {
                          commitTitle: customMergeMessage.title.trim(),
                          commitMessage: customMergeMessage.message.trim(),
                        }
                      : {}),
                  });
                }
                else void act("close");
              }}
            >
              {acting ? <Spinner /> : null}
              {confirmAction?.kind === "merge" ? t("merge") : t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* “Have it checked by Numo” starts in the configured server sandbox. */}
      <FormDialog
        open={aiReviewDialog}
        onOpenChange={(next) => {
          if (!next) setAiReviewDialog(false);
        }}
        title={t("aiReview")}
        description={t("numoReviewDialogDescription")}
        className="sm:max-w-md"
        submitLabel={t("numoReviewStart")}
        submitIcon={<NumoIcon animated={false} />}
        submitDisabled={!prPageContext}
        submitting={false}
        cancelLabel={t("cancel")}
        onCancel={() => setAiReviewDialog(false)}
        onSubmit={startAiReview}
      >
        <div />
      </FormDialog>

      {/* Review dialogue — all three verdicts share the same form;
          only the box “and restart Numo” distinguishes the request for changes. */}
      <FormDialog
        open={reviewDialogOpen}
        onOpenChange={(next) => {
          if (!next && !submitting) {
            setReviewDialogOpen(false);
            setReviewVerdict(null);
            setReviewFromFiles(false);
          }
        }}
        title={
          reviewFromFiles
            ? t("reviewFinishTitle")
            : t(
                reviewVerdict === "approve"
                  ? "reviewApproveTitle"
                  : reviewVerdict === "comment"
                    ? "reviewCommentTitle"
                    : "reviewRequestChangesTitle",
              )
        }
        className="sm:max-w-md"
        submitLabel={reviewSubmitLabel}
        submitDisabled={reviewSubmitDisabled}
        submitting={submitting}
        submitIcon={submitting ? <Spinner /> : null}
        cancelLabel={t("cancel")}
        onCancel={() => {
          setReviewDialogOpen(false);
          setReviewVerdict(null);
          setReviewFromFiles(false);
        }}
        onSubmit={() => void submitReview()}
        dictation={{
          onTranscription: (text) =>
            setReviewMessage((value) => `${value}${value ? " " : ""}${text}`),
          disabled: submitting,
        }}
      >
          {reviewFromFiles ? (
            <div
              role="radiogroup"
              aria-label={t("reviewDecision")}
              className="grid gap-2"
            >
              {([
                {
                  verdict: "comment",
                  label: t("reviewComment"),
                  hint: t("reviewChoiceCommentHint"),
                  icon: MessageSquare,
                },
                {
                  verdict: "approve",
                  label: t("reviewApprove"),
                  hint: t("reviewChoiceApproveHint"),
                  icon: Check,
                },
                {
                  verdict: "request_changes",
                  label: t("reviewRequestChanges"),
                  hint: t("reviewChoiceChangesHint"),
                  icon: X,
                },
              ] as const).map((choice) => {
                const Icon = choice.icon;
                const selected = reviewVerdict === choice.verdict;
                return (
                  <label
                    key={choice.verdict}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      selected ? "border-brand bg-brand/5" : "border-border",
                    )}
                  >
                    <input
                      type="radio"
                      name={`pr-review-verdict-${item.prId}`}
                      value={choice.verdict}
                      checked={selected}
                      onChange={() => selectReviewVerdict(choice.verdict)}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      <Icon className="size-3" />
                    </span>
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">{choice.label}</span>
                      <span className="text-xs text-muted-foreground">{choice.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}

          {/* The two modes of requesting changes. The second exists
              because the instructions are almost always the SAME — “take this
              that we wrote to you and correct it” — and that we retyped it by hand
              while the remarks are already on the PR, readable by the agent.
              Absent from the other two verdicts: approve and comment do not
              que parler, ils n'ont qu'un mode. */}
          {reviewVerdict === "request_changes" ? (
            <Tabs
              value={reviewMode}
              onValueChange={(v) => switchReviewMode(v as "write" | "findings")}
            >
              <TabsList className="w-full">
                <TabsTrigger value="write" className="flex-1">
                  {t("reviewModeWrite")}
                </TabsTrigger>
                {canRelaunch ? (
                  <TabsTrigger value="findings" className="flex-1">
                    {t("reviewModeFindings")}
                  </TabsTrigger>
                ) : (
                  // Numo has never pushed this PR: it has no branch to
                  // restart, so nothing to correct. Disabled WITH his reason —
                  // a silent tab would leave users searching.
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="flex-1">
                        <TabsTrigger value="findings" disabled className="w-full">
                          {t("reviewModeFindings")}
                        </TabsTrigger>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t("reviewFindingsUnavailable")}
                    </TooltipContent>
                  </Tooltip>
                )}
              </TabsList>
            </Tabs>
          ) : null}

          <div
            className={cn(
              "relative min-w-0 max-w-full overflow-clip rounded-md border border-border transition-colors focus-within:border-ring",
              reviewDrop.dragging && "border-brand",
            )}
            onPaste={pasteFileHandler(reviewUploads.addFiles)}
            {...reviewDrop.handlers}
          >
            <DropOverlay show={reviewDrop.dragging} />
            <Textarea
              value={reviewMessage}
              onChange={(e) => setReviewMessage(e.target.value)}
              // Match the shortcut used by every other composer: the active
              // send mode submits, while Shift+Enter keeps a newline.
              onKeyDown={(e) => {
                if (!isSend(e)) return;
                e.preventDefault();
                if (!reviewSubmitDisabled) void submitReview();
              }}
              placeholder={t(
                reviewFromFiles
                  ? "reviewSummaryPlaceholder"
                  : reviewVerdict === "approve"
                    ? "reviewApprovePlaceholder"
                    : "reviewPlaceholder",
              )}
              rows={reviewMode === "findings" ? 5 : 4}
              autoFocus
              className="min-w-0 w-full max-w-full resize-none whitespace-pre-wrap [overflow-wrap:anywhere] rounded-none border-0 bg-card pb-10 focus-visible:border-0 focus-visible:ring-0"
            />
            <div className="absolute bottom-1.5 left-1.5 z-10">
              <AttachButton
                onFiles={reviewUploads.addFiles}
                disabled={submitting || reviewUploads.uploading}
              />
            </div>
          </div>

          {/* What this mode REALLY does, once said: text is a
              deposit for Numo, not a review — nothing leaves under your name. */}
          {reviewVerdict === "request_changes" && reviewMode === "findings" ? (
            <p className="text-xs text-muted-foreground">{t("reviewFindingsHint")}</p>
          ) : null}

          {/* Without a git account, the verdict has no one to sign it (MIN-144):
              only the raise leaves. Say it here rather than letting people believe
              a published review. */}
          {reviewVerdict === "request_changes" && reviewMode === "write" && !canComment ? (
            <p className="text-xs text-muted-foreground">{t("reviewNoVerdictHint")}</p>
          ) : null}

          {/* A request for changes can also ask Numo to revise this exact PR.
              The PR id and head ref, rather than worker history, preserve lineage. */}
          {reviewVerdict === "request_changes" && reviewMode === "write" && canRelaunch ? (
            item.busyRunId ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="flex items-center gap-2">
                    <Checkbox checked={false} disabled />
                    <span className="text-sm text-muted-foreground">
                      {t("reviewRelaunchNumo")}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">{tAgent("errorAlreadyRunning")}</TooltipContent>
              </Tooltip>
            ) : (
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={relaunch}
                  onCheckedChange={(v) => setRelaunch(v === true)}
                  disabled={submitting}
                />
                <span className="text-sm">{t("reviewRelaunchNumo")}</span>
              </label>
            )
          ) : null}

      </FormDialog>
    </div>
    </PrEndpointProvider>
  );
}
