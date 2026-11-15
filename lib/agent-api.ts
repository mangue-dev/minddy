"use client";

import type { IssuePr } from "@/lib/issue-pr";
import { fetchClientRead } from "./client-read";

import type { RepoProviderId } from "@/lib/repo-providers";
import type { ReviewThreadState } from "@/lib/pr-review-threads";
import type { PrTimelineEvent } from "@/lib/pr-timeline";
import type {
  ReviewCommentReaction,
  ReviewReactionContent,
} from "@/lib/pr-review-reactions";
import { trackEvent } from "./analytics";
import type { MergeMethod, PullRequestReadiness } from "./pr-readiness";
import type {
  CheckRerunRef,
  ForgeAccount,
  PrMaintenanceAction,
  PrStateAction,
  PullRequestComment,
  PullRequestCommit,
  PullRequestDetailResponse,
  PullRequestFile,
  PullRequestListItem,
  PullRequestReviewComment,
  PullRequestState,
  RepoMember,
  ReviewVerdict,
} from "./pull-request-contract";

// The wire records are shared with the server through the contract module;
// the fetchers below are typed with them.
export type { CheckState, MergeMethod } from "./pr-readiness";
export type {
  ChecksSummary,
  PrViewer,
  PullRequestCheck,
  PullRequestComment,
  PullRequestCommit,
  PullRequestDetailResponse,
  PullRequestFile,
  PullRequestListItem,
  PullRequestRef,
  PullRequestReviewComment,
  PullRequestReviewSummary,
  RepoMember,
  ReviewVerdict,
} from "./pull-request-contract";

/**
 * Pull request client fetchers (MIN-138, MIN-143): the PR list, its detail,
 * review gestures, comments and the issue ↔ PR link.
 */

/**
 * API error which keeps the `code` business of the route (e.g. `lineNotInDiff`) in
 * more of the message: some callers must distinguish the case, not only
 * display it. One `Error` remains — callers who only read `.message` are
 * unchanged.
 */
export class ApiError extends Error {
  code?: string;
  status?: number;
  retryAt?: number;
  /**
   * Structured detail that the raw message does not carry — today the
   * `modelLimit` of a refusal `modelAbovePlan` (model, multiplier, ceiling,
   * plan), which the screen needs to tell which one and how far.
   */
  details?: Record<string, unknown>;
  constructor(
    message: string,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

function retryAfterDeadline(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  const deadline = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000 : Date.parse(value);
  return Number.isFinite(deadline) ? deadline : undefined;
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const payload = data as {
      error?: string;
      code?: string;
      modelLimit?: Record<string, unknown>;
    } | null;
    const message = payload?.error || text.trim() || "Request failed";
    const error = new ApiError(message, payload?.code, payload?.modelLimit);
    error.status = response.status;
    error.retryAt = retryAfterDeadline(response.headers.get("retry-after"));
    throw error;
  }
  return data as T;
}

// The issue's pull request lives in a pure module, so the card face can read
// it without this API client.
export { isPrWorthShowing, type IssuePr } from "@/lib/issue-pr";

export async function fetchIssuePullRequestApi(
  issueId: string,
): Promise<{ pullRequest: IssuePr | null }> {
  return parseJson(await fetchClientRead(`/api/issues/${issueId}/pull-request`));
}

export async function fetchPullRequestApi(
  prId: string,
  signal?: AbortSignal,
): Promise<PullRequestDetailResponse> {
  return parseJson(await fetchClientRead(`/api/pull-requests/${prId}`, { signal, cache: "no-store" }));
}

/** The environment built from a pull request's live head (MIN-889). */
export interface PullRequestDeploymentResponse {
  /** The head the deployment was resolved for. */
  headSha: string | null;
  deploymentUrl: string | null;
  /** Lifecycle of the head environment as the forge reports it. */
  deploymentStatus: "success" | "in_progress" | null;
  /** Created date of the deployment in flight — the card ticks from it. */
  deploymentStartedAt: string | null;
  /** Time the environment took to settle, when the forge dates it. */
  deploymentDurationMs: number | null;
}

/**
 * Read apart from the detail: resolving it walks the forge's deployments one
 * reference at a time, which used to hold the whole detail back.
 */
export async function fetchPullRequestDeploymentApi(
  prId: string,
  signal?: AbortSignal,
): Promise<PullRequestDeploymentResponse> {
  return parseJson(await fetchClientRead(`/api/pull-requests/${prId}/deployment`, { signal, cache: "no-store" }));
}

/**
 * What a board needs to offer the merge gestures of a row (auto-merge state,
 * whether the repository allows it, whether the viewer may write). The server
 * gates each gesture again when it runs.
 */
export interface PullRequestMergeFlow {
  /** Auto-merge or a merge queue entry is set on the pull request. */
  active: boolean;
  autoMergeAllowed: boolean | null;
  canWrite: boolean;
}

export interface PullRequestReadinessBatchResponse {
  readiness: Record<string, PullRequestReadiness>;
  /** Absent from responses of a server older than this field. */
  mergeFlow?: Record<string, PullRequestMergeFlow>;
  unavailablePrIds: string[];
  retryStatus?: 403 | 429;
  /** Client-anchored transport deadline, never content freshness or write authority. */
  retryAt?: number;
}

export async function fetchPullRequestReadinessBatchApi(
  prIds: readonly string[],
): Promise<PullRequestReadinessBatchResponse> {
  const params = new URLSearchParams();
  for (const prId of prIds) params.append("pr", prId);
  const response = await fetchClientRead(`/api/pull-requests/readiness?${params}`);
  const data = await parseJson<PullRequestReadinessBatchResponse>(response);
  return data.retryStatus === 403 || data.retryStatus === 429
    ? { ...data, retryAt: retryAfterDeadline(response.headers.get("retry-after")) ?? Date.now() + 60_000 }
    : data;
}

/** Basis of routes for a pull request (MIN-143), indexed by the PR. */
export type PrEndpoint = string;

export function prEndpoint(prId: string): PrEndpoint {
  return `/api/pull-requests/${prId}`;
}

/**
 * Base version of a PR file (plain text at merge base) — the source of the
 * context unfolding in diff view. `path` = base side path.
 */
export async function fetchPrFileSourceApi(
  endpoint: PrEndpoint,
  path: string,
): Promise<{ content: string }> {
  return parseJson(
    await fetchClientRead(`${endpoint}/file?path=${encodeURIComponent(path)}`),
  );
}

/**
 * Byte proxy URL of a diff file — the source of the view's `<img>`
 * side by side images (MIN-66). `path` = the path as the diff names it
 * (the server itself deduces the base version of a renamed file).
 */
export function prFileRawUrl(
  endpoint: PrEndpoint,
  path: string,
  side: "base" | "head",
): string {
  return `${endpoint}/file/raw?path=${encodeURIComponent(path)}&side=${side}`;
}

export async function actOnPullRequestApi(
  prId: string,
  action: PrStateAction,
  options: {
    method?: MergeMethod;
    commitTitle?: string;
    commitMessage?: string;
  } = {},
): Promise<{ ok: true; pr_state: PullRequestState }> {
  trackEvent("pr_review_submitted", { verdict: action });
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...options }),
    }),
  );
}

/**
 * "Generate then merge" (MIN-548): the generation runs in the background
 * and the merge fires the moment it lands. Optimistic by design — the
 * answer only says the job started; the broadcast carries the outcome.
 */
export async function mergeWithNumoApi(
  prId: string,
  method: MergeMethod | null,
): Promise<{ ok: true; started: true }> {
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "merge_with_numo", method }),
    }),
  );
}

export async function maintainPullRequestApi(
  prId: string,
  action: PrMaintenanceAction,
  payload: {
    title?: string;
    body?: string;
    rerunRef?: CheckRerunRef | null;
  } = {},
): Promise<{ ok: true; title?: string }> {
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    }),
  );
}

/** Add an issue to a PR and synchronize its status with the current PR state. */
export async function linkPullRequestIssueApi(
  prId: string,
  issueId: string,
  prState: string,
): Promise<{
  ok: true;
  issue: { id: string; number: number; title: string };
  status: string | null;
}> {
  trackEvent("pr_issue_linked", { pr_state: prState });
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link_issue", issueId }),
    }),
  );
}

export async function unlinkPullRequestIssueApi(
  prId: string,
  issueId: string,
): Promise<{ ok: true }> {
  return parseJson(await fetch(prEndpoint(prId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "unlink_issue", issueId }),
  }));
}

/**
 * Submits a review on PR (MIN-138).
 *
 * `published: "comment"` in return = the forge refused to publish the verdict —
 * An App cannot approve its own pull request. The verdict is recorded
 * minddy side anyway; the caller must tell the user.
 */
export async function submitPullRequestReviewApi(
  prId: string,
  input: {
    verdict: ReviewVerdict;
    message: string;
  },
): Promise<{
  ok: true;
  /** `comment` = the forge folded the verdict up, being unable to carry it
   * (self-review). */
  published: "review" | "comment";
}> {
  trackEvent("pr_review_submitted", { verdict: input.verdict });
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review", ...input }),
    }),
  );
}

/** Ask a repository member to review the pull request. */
export async function requestPullRequestReviewerApi(prId: string, login: string): Promise<{ ok: true }> {
  return parseJson(await fetch(`${prEndpoint(prId)}/review-requests`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login }),
  }));
}

// ── Global Pull Requests page (MIN-66, expanded by MIN-143) ─────────────────

/** List filtering state — served by the SERVER (`?state=`). */
export type PullRequestStateFilter = "open" | "merged" | "closed" | "completed" | "all";

export interface PullRequestListResponse {
  pullRequests: PullRequestListItem[];
  /** There are more beyond `limit` — the “see more” button on the page. */
  hasMore: boolean;
  /** The pagination of a forge has been cut: the list is not exhaustive. */
  truncated: boolean;
  /** Linked deposits visible by this account, all projects combined. 0 = there is
   * nothing to show here until a repository is linked somewhere. */
  repoCount: number;
  /** Is there ONE pull request, all states combined? An empty list on the
   * “open” filter does not say the same thing as an account that does not have any
   * never had — only the second deserves a home screen. */
  anyPr: boolean;
}

/**
 * `pin` PINS a PR in the answer even if it falls off the page — a
 * deep-link to an old PR should not depend on the depth of the scrolling.
 */
export async function fetchAllPullRequestsApi(input: {
  state: PullRequestStateFilter;
  limit: number;
  offset?: number;
  pin?: { pr?: string | null };
}, signal?: AbortSignal): Promise<PullRequestListResponse> {
  const params = new URLSearchParams({
    state: input.state,
    limit: String(input.limit),
  });
  if (input.offset != null) params.set("offset", String(input.offset));
  if (input.pin?.pr) params.set("pr", input.pin.pr);
  return parseJson(await fetchClientRead(`/api/pull-requests?${params}`, { signal }));
}

/** Lightweight open-PR count used by the persistent app shell. */
export async function fetchOpenPullRequestCountApi(): Promise<{ count: number }> {
  return parseJson(await fetchClientRead("/api/pull-requests/count"));
}

/**
 * The conversation thread: messages, PR ACTIVITY (MIN-159) and reactions,
 * served together — it all goes into one thread ordered by date.
 *
 * `reactions` ALSO carries those of the body of the PR, under `PR_BODY_COMMENT_ID`:
 * the message that opens the thread is reacted like the others.
 *
 * `timeline` is best-effort on the server side: an empty list means “the forge
 * did not know how to give it” as much as “nothing happened”. The thread then makes
 * his messages, as before.
 */
export async function fetchPullRequestCommentsApi(prId: string, signal?: AbortSignal): Promise<{
  comments: PullRequestComment[];
  timeline: PrTimelineEvent[];
  reactions: ReviewCommentReaction[];
}> {
  return parseJson(await fetchClientRead(`${prEndpoint(prId)}/comments`, { signal }));
}

/**
 * The commits that make up the PR, from oldest to newest on the forge side —
 * the Commits tab then displays them from newest to oldest.
 * `truncated`: PR has more than Minddy lists at once.
 */
export async function fetchPullRequestCommitsApi(
  prId: string,
  signal?: AbortSignal,
): Promise<{ commits: PullRequestCommit[]; truncated: boolean }> {
  return parseJson(await fetchClientRead(`${prEndpoint(prId)}/commits`, { signal }));
}

/**
 * The forge accounts mentionable on this PR (MIN-162). Never in
 * server side error: at worst an empty list, and the composer does not offer any
 * simply none.
 */
export async function fetchPullRequestMembersApi(
  endpoint: PrEndpoint,
): Promise<{ members: RepoMember[] }> {
  return parseJson(await fetchClientRead(`${endpoint}/members`));
}

/** Base of ONE commit routes: its diff, and — like a PR — its files. */
export function prCommitEndpoint(prId: string, sha: string): PrEndpoint {
  return `${prEndpoint(prId)}/commits/${sha}`;
}

export interface PrCommitDiff {
  files: PullRequestFile[];
  additions: number;
  deletions: number;
  url: string | null;
  parentSha: string | null;
  message: string;
  author: ForgeAccount | null;
  authorName: string | null;
  authoredAt: string | null;
  provider?: RepoProviderId;
}

/**
 * The diff of ONE PR commit, against its parent. Serves the view “what this
 * commit change” — same files/patches as the PR diff, so the same
 * rendering component, except that context unfolding resolves the problem there.
 * PARENT du commit (cf. `prCommitEndpoint`).
 */
export async function fetchPrCommitDiffApi(
  prId: string,
  sha: string,
): Promise<PrCommitDiff> {
  return parseJson(await fetchClientRead(prCommitEndpoint(prId, sha)));
}

/**
 * Post or remove a reaction on a message in the conversation thread, or on the
 * PR body (`commentId: PR_BODY_COMMENT_ID`). `on` has the DESIRED state, not
 * a switch — same contract as on the review side.
 */
export async function setPrCommentReactionApi(
  endpoint: PrEndpoint,
  input: { commentId: number; content: ReviewReactionContent; on: boolean },
): Promise<{ ok: true; on: boolean }> {
  return parseJson(
    await fetch(`${endpoint}/comments/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment_id: input.commentId,
        content: input.content,
        on: input.on,
      }),
    }),
  );
}

/**
 * Review comments AND condition of their sons (MIN-139), served together: one
 * thread goes with both. `threads` can be empty while comments
 * exist — the forge was unable to tell the state, and the UI then does not offer
 * “Resolve” button rather than announcing “open” blindly.
 */
export async function fetchPrReviewCommentsApi(endpoint: PrEndpoint, signal?: AbortSignal): Promise<{
  comments: PullRequestReviewComment[];
  threads: ReviewThreadState[];
  reactions: ReviewCommentReaction[];
}> {
  return parseJson(await fetchClientRead(`${endpoint}/review-comments`, { signal }));
}

/**
 * Post or remove a reaction to a review comment. `on` carries the state
 * WANTED, not a switch: two competing clicks converge instead of
 * cancels itself, and a resend after network failure does not undo what had succeeded.
 */
export async function setPrReviewCommentReactionApi(
  endpoint: PrEndpoint,
  input: { commentId: number; content: ReviewReactionContent; on: boolean },
): Promise<{ ok: true; on: boolean }> {
  return parseJson(
    await fetch(`${endpoint}/review-comments/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment_id: input.commentId,
        content: input.content,
        on: input.on,
      }),
    }),
  );
}

/**
 * Answers, from a ticket, a comment mirrored from its pull request: the answer
 * is posted on the forge under the caller's git account (MIN-802).
 */
export async function postForgeReplyApi(
  issueId: string,
  commentId: string,
  body: string,
): Promise<unknown> {
  return parseJson(
    await fetch(`/api/issues/${issueId}/comments/${commentId}/forge-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }),
  );
}

/** Resolves/reopens a review thread (`threadId` comes from `threads` above). */
export async function setPrReviewThreadResolvedApi(
  endpoint: PrEndpoint,
  input: { threadId: string; resolved: boolean },
): Promise<{ ok: true; resolved: boolean }> {
  return parseJson(
    await fetch(`${endpoint}/review-comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread_id: input.threadId,
        resolved: input.resolved,
      }),
    }),
  );
}

/**
 * Post a comment on a line in the diff — or on a RANGE of lines, in
 * passing `startLine` (`line` is then the LAST line referred to, like GitHub
 * waiting for it). Share immediately on GitHub. Raise a code `ApiError`
 * `lineNotInDiff` if GitHub refuses to anchor the line.
 */
export async function postPrReviewCommentApi(
  endpoint: PrEndpoint,
  input: {
    body: string;
    path: string;
    line: number;
    side: "LEFT" | "RIGHT";
    startLine?: number;
    startSide?: "LEFT" | "RIGHT";
  },
): Promise<{ comment: PullRequestReviewComment }> {
  const { startLine, startSide, ...rest } = input;
  return parseJson(
    await fetch(`${endpoint}/review-comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...rest,
        ...(startLine != null
          ? { start_line: startLine, start_side: startSide }
          : {}),
      }),
    }),
  );
}

/** Reply in a review thread (`inReplyTo` = any thread id). */
export async function replyPrReviewCommentApi(
  endpoint: PrEndpoint,
  input: { body: string; inReplyTo: number },
): Promise<{ comment: PullRequestReviewComment }> {
  return parseJson(
    await fetch(`${endpoint}/review-comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: input.body, in_reply_to: input.inReplyTo }),
    }),
  );
}

/**
 * Post a message in the PR thread.
 *
 * `review` accompanies the response when the message MENTIONED `@numo`
 * (MIN-162): the pass is already open on the server side when it returns, and
 * it is this field that allows the screen to show it RIGHT AWAY. Without him, he
 * would only discover it at the next fortuitous refresh.
 */
export async function postPullRequestCommentApi(
  prId: string,
  body: string,
): Promise<{
  comment: PullRequestComment;
  review?: {
    conversationId: string;
    turnId: string;
  } | null;
}> {
  return parseJson(
    await fetch(`${prEndpoint(prId)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }),
  );
}

/**
 * A PREVIOUS version of a thread comment — the snapshot taken when the
 * message was edited (by minddy, or by its webhook echo when the forge sends
 * the old body). Served oldest-first.
 */
export interface PullRequestCommentEdit {
  body: string;
  edited_by: string | null;
  created_at: string;
}

/**
 * Rewrites a thread comment on the forge, under the connected account.
 * The server snapshots the PREVIOUS body first, so "previous versions" can
 * list it afterwards.
 */
export async function updatePullRequestCommentApi(
  endpoint: PrEndpoint,
  input: { commentId: number; body: string },
): Promise<{ comment: PullRequestComment }> {
  return parseJson(
    await fetch(`${endpoint}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId: input.commentId, body: input.body }),
    }),
  );
}

/** Previous versions of one comment, oldest-first. */
export async function fetchPullRequestCommentEditsApi(
  endpoint: PrEndpoint,
  commentId: number,
  signal?: AbortSignal,
): Promise<{ edits: PullRequestCommentEdit[] }> {
  return parseJson(
    await fetchClientRead(`${endpoint}/comment-edits?commentId=${commentId}`, { signal }),
  );
}
