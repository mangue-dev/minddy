"use client";

import { fetchClientRead } from "./client-read";

import type { RepoProviderId } from "@/lib/repo-providers";
import type { ReviewThreadState } from "@/lib/pr-review-threads";
import type { PrTimelineEvent } from "@/lib/pr-timeline";
import type { CommitAuthor } from "@/lib/commit-authors";
import type {
  ReviewCommentReaction,
  ReviewReactionContent,
} from "@/lib/pr-review-reactions";
import { trackEvent } from "./analytics";
import type { PullRequestReadiness } from "./pr-readiness";
import type { IssueStatus } from "./issue-constants";

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

/**
 * The pull request for a ticket, as the cards and sign read it.
 *
 * It was read on Numo's runs — which made it invisible as soon as
 * no one had launched an agent (human PR, or PR attached to the hand), and as soon
 * that it was CLOSED. It now comes from `pull_requests`, all states
 * confused: “See the pull request” should lead to a closed PR as well as to a
 * other. The chip is silent on `closed` — this is the only state that does not call
 * plus rien.
 */
export interface IssuePr {
  /** Id minddy — `?pr=` opens the PR whatever its state (the page pins it). */
  prId: string;
  prNumber: number;
  state: "draft" | "open" | "merged" | "closed";
}

/** A PR still alive or delivered: everything but refused. */
export function isPrWorthShowing(pr: IssuePr | null): boolean {
  return !!pr && pr.state !== "closed";
}

export async function fetchIssuePullRequestApi(
  issueId: string,
): Promise<{ pullRequest: IssuePr | null }> {
  return parseJson(await fetchClientRead(`/api/issues/${issueId}/pull-request`));
}

export interface PullRequestRef {
  number: number;
  url: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  title?: string;
  body?: string | null;
  head?: string;
  /** Provider-qualified head name used by the default merge commit title. */
  headLabel?: string;
  /** `true` only when the forge confirms that the head branch lives in the base repository. */
  headFromBaseRepository?: boolean;
  base?: string;
  /** Head SHA — the EXACT diff served. Compared to the SHA that was reread by the last
   * Numo review to see if relaunch would have anything new to read. */
  headSha?: string;
  /** How many commits the PR carries, according to the forge. GitHub itself counts it;
      GitLab does not serve it and leaves the field absent (the caller then falls back to
      the length of the commit list, as long as it is not truncated). */
  commitCount?: number;
  /** Author and opening date: `body` opens the conversation thread as a comment. */
  user?: { login: string; avatar_url: string | null } | null;
  createdAt?: string;
  /** Last forge edit of the body — the "(edited)" marker reads it. */
  updatedAt?: string;
  /** `null`/absent = UNKNOWN fusionability (forges calculate it using
      asynchronous), never display as “blocked” — MIN-138. */
  mergeable?: boolean | null;
  /** `clean` · `blocked` (repository requires approvals/checks) · `dirty` (conflict)
      · `unstable` (checks not required in failure) · `unknown`. */
  mergeableState?: string | null;
  /** Provider refusal normalized to one actionable reason. */
  mergeabilityReason?: import("./pr-readiness").MergeabilityReason | null;
  mergeFlowActive?: boolean;
  reviewDecision?: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  /** Direct reviewer requests that are still pending at the forge. */
  requestedReviewers?: Array<{ login: string; avatar_url: string | null }>;
  /** Fully rendered GitLab defaults for the merge dialog. */
  defaultMergeCommitMessage?: string | null;
  defaultSquashCommitMessage?: string | null;
}

/** Normalized status of a CI check (MIN-138) — mirror of `lib/server/agent/checks-core.ts`. */
export type CheckState = "pending" | "success" | "failure" | "neutral";

export interface PullRequestCheck {
  name: string;
  state: CheckState;
  /** Pending but not started yet (waiting for a runner or a resource). */
  queued?: boolean;
  url: string | null;
  /** The integration that produced the check (“GitHub Actions”, “Vercel”…),
      when the check name does not already have it. */
  appName: string | null;
  /** Its logo at the forge. `null` → the UI falls back to the forge icon. */
  appAvatarUrl: string | null;
  /** The result in one line, as the forge formulates it. */
  description: string | null;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  required: boolean | null;
  rerunRef: { kind: "github_check_suite" | "gitlab_pipeline"; id: number } | null;
}

export interface ChecksSummary {
  checks: PullRequestCheck[];
  /** Stable branch or pull-request preview advertised by a successful check. */
  deploymentUrl?: string | null;
  /** Aggregate: failure wins, then “in progress”. `null` = no check. */
  state: CheckState | null;
  /** Non-blocking checks (successful or neutral) — the `n` of “n/m passed”. */
  passing: number;
  total: number;
  startedAt: string | null;
  completedAt: string | null;
}

/** Merge methods offered by the forge of the linked repository. */
export type MergeMethod = "merge" | "squash" | "rebase";

export interface PullRequestReviewSummary {
  approvals: number;
  changesRequested: number;
  requiredApprovals?: number | null;
}

/**
 * Response from the GET of the PR of a run. Two nuances of “no checks”:
 * `checks: null` = on n'a pas pu lire (`checksError` dit pourquoi — `forbidden`
 * = GitHub permission that the installation did not accept), `checks.total === 0`
 * = the repository has no CI. Same thing for `reviews: null`.
 */
/**
 * What the current user can do on this PR (MIN-144). On GitHub
 * like on GitLab, a human gesture starts from HIS Git account: without account
 * connected, or without rights to the deposit, minddy says it instead of offering a button
 * who would lie about the author.
 */
export interface PrViewer {
  provider: RepoProviderId;
  /** Does the provider have the means to authorize an account (self-host without env)? */
  configured: boolean;
  connected: boolean;
  /** An account is connected but the forge REFUSES its token: to be reauthorized.
      Absent on a tab that remained open since a version before this field. */
  expired?: boolean;
  login: string | null;
  /** Avatar of the connected forge account that will author human actions. */
  avatarUrl?: string | null;
  /** `write` = merge/resolve, `read` = reviewer/comment, `none` = nothing. */
  capability: "write" | "read" | "none";
  /** The account under which Numo writes at the forge – enough to recognize SES
      messages in the thread (MIN-162). `null` on the GitLab side, where nothing
      distinguishes (MIN-146), and on a tab that has remained open since a version
      before this field. */
  numoLogin?: string | null;
  /** The viewer only reads the linking project (Reader role, MIN-693): every
      PR action is refused whatever the forge account may do. Absent on older
      responses. */
  projectReadOnly?: boolean;
}

export interface AgentRunPrResponse {
  pr: PullRequestRef | null;
  files: PullRequestFile[];
  provider?: RepoProviderId;
  checks?: ChecksSummary | null;
  checksError?: "forbidden" | "unknown" | null;
  deploymentUrl?: string | null;
  /** Time the environment took to settle, when the forge dates it. */
  deploymentDurationMs?: number | null;
  /** Lifecycle of the head environment as the forge reports it. */
  deploymentStatus?: "success" | "in_progress" | null;
  /** Created date of the deployment in flight — the card ticks from it. */
  deploymentStartedAt?: string | null;
  reviews?: PullRequestReviewSummary | null;
  viewer?: PrViewer;
  mergeMethods?: MergeMethod[];
  mergePolicy?: import("./pr-readiness").RepositoryMergePolicy | null;
  readiness?: import("./pr-readiness").PullRequestReadiness | null;
  reviewThreads?: import("./pr-review-threads").ReviewThreadState[] | null;
}

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  /** Path BEFORE the PR if the file has been renamed — it addresses the base version. */
  previous_filename?: string;
}

export async function fetchPullRequestApi(
  prId: string,
  signal?: AbortSignal,
): Promise<AgentRunPrResponse> {
  return parseJson(await fetchClientRead(`/api/pull-requests/${prId}`, { signal, cache: "no-store" }));
}

export interface PullRequestReadinessResponse {
  provider: RepoProviderId;
  readiness: PullRequestReadiness;
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

export async function fetchPullRequestReadinessApi(
  prId: string,
): Promise<PullRequestReadinessResponse> {
  return parseJson(await fetchClientRead(`/api/pull-requests/${prId}/readiness`));
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
  action: "merge" | "close" | "reopen" | "ready_for_review" | "convert_to_draft",
  options: {
    method?: MergeMethod;
    commitTitle?: string;
    commitMessage?: string;
  } = {},
): Promise<{ ok: true; pr_state: PullRequestListItem["pr_state"] }> {
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
  action:
    | "update_branch"
    | "rerun_check"
    | "update_title"
    | "update_body"
    | "enable_auto_merge"
    | "disable_auto_merge",
  payload: {
    title?: string;
    body?: string;
    rerunRef?: PullRequestCheck["rerunRef"];
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

/** Verdict of a review submitted from minddy (MIN-138). */
export type ReviewVerdict = "approve" | "request_changes" | "comment";

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

export interface PullRequestListItem {
  /** The item IS the PR. */
  prId: string;
  /** Authenticated viewer authored this PR at the forge. */
  createdByMe?: boolean;
  /** The viewer has a pending review request at the forge. */
  reviewRequestedForMe?: boolean;
  pr_number: number;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed";
  /** Linked Repository Provider — controls PR/MR vocabulary and links (MIN-69). */
  provider: RepoProviderId;
  title: string | null;
  /** Who opened it at the forge. */
  author: { login: string; avatar_url: string | null } | null;
  head_branch: string | null;
  created_at: string;
  updated_at: string;
  issue: { id: string; number: number; title: string } | null;
  issues?: Array<{ id: string; number: number; title: string; project_id: string; project_key: string; status?: IssueStatus }>;
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    orb_seed: string | null;
  } | null;
}

export interface PullRequestComment {
  id: number;
  body: string;
  user: { login: string; avatar_url: string | null } | null;
  created_at: string;
  /** Last edit AT THE FORGE — the "(edited)" marker reads `updated_at` vs
      `created_at`. `null` when the forge never carried it. */
  updated_at?: string | null;
  html_url: string;
}

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
 * A PR commit. TWO authors, and they do not say the same thing:
 * `author` is the ACCOUNT of the forge (avatar + login), when it was able to attach
 * the commit email; `authorName` is the name written IN the commit, which git has
 * always. On the GitLab side, whose API does not serve any account on this endpoint, it
 * There is only ever the second - hence the fallback of the rendering on it.
 */
export interface PullRequestCommit {
  sha: string;
  /** FULL message: first line = title, the rest = body. */
  message: string;
  author: { login: string; avatar_url: string | null } | null;
  authorName: string | null;
  /** Author email — the deduplication key with co-signers. */
  authorEmail: string | null;
  authoredAt: string | null;
  url: string | null;
  /** Signature verified. `null` = UNKNOWN (GitLab doesn't serve it), not "no". */
  verified: boolean | null;
  /** First parent — the "before" side of this commit's diff. */
  parentSha: string | null;
  /** Lines added/removed BY THIS COMMIT. `null` = the forge did not know the
      give (GraphQL failed, or MR too long on the GitLab side): the indicator
      +/− then disappears, but the commit diff remains open. */
  additions: number | null;
  deletions: number | null;
  /**
   * ALL its authors, principal at the head (MIN-159). A co-signed commit
   * (`Co-authored-by:`) has several — the common case as soon as an agent has held
   * the keyboard — and the screen stacks avatars, like the forge.
   *
   * OPTIONAL although the road always fills it: a tab remained open
   * during a deployment keeps in cache the response of the previous version, which
   * did not have this field. The guy says it, so that every reading keeps it —
   * otherwise the entire page falls on a `.length` of `undefined`.
   */
  authors?: CommitAuthor[];
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

/** An account of the forge, as the commentary composer suggests. */
export interface RepoMember {
  login: string;
  avatar_url: string | null;
  name: string | null;
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
  author: { login: string; avatar_url: string | null } | null;
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
 * Review comment: anchored to a line in the diff, unlike
 * `PullRequestComment` which lives in the flat thread of the conversation.
 *
 * `line` non-zero does NOT mean “the line is in the diff”: GitHub
 * keeps as long as he knows how to find the line in his head, even if the diff has
 * moved elsewhere. It is the resolution in the rendered hunks that decides
 * l'affichage inline — voir `pr-diff`.
 */
export interface PullRequestReviewComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  original_line: number | null;
  side: "LEFT" | "RIGHT";
  /** First line of a MULTI-LINE remark (MIN-181) — `line` is then
      the last. `null` for a single-line remark, and always
      `null` on the GitLab side, where a note is anchored on a line. */
  start_line: number | null;
  /** First line at the original commit, retained when GitHub marks the thread outdated. */
  original_start_line: number | null;
  start_side: "LEFT" | "RIGHT" | null;
  /** Root of the thread, or null if this comment IS the root. */
  in_reply_to_id: number | null;
  /** Review that carries this comment (MIN-159) — the conversation thread ranges
      the points of a review UNDER it. `null` on the GitLab side, without review purpose. */
  review_id: number | null;
  diff_hunk: string;
  user: { login: string; avatar_url: string | null } | null;
  created_at: string;
  html_url: string;
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
