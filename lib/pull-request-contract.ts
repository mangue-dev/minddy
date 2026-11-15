import type { CommitAuthor } from "./commit-authors";
import type { IssueStatus } from "./issue-constants";
import type {
  CheckState,
  MergeabilityReason,
  MergeMethod,
  PullRequestReadiness,
  RepositoryMergePolicy,
} from "./pr-readiness";
import type { ReviewThreadState } from "./pr-review-threads";
import type { RepoProviderId } from "./repo-providers";

/**
 * Wire contract of the pull request routes (`app/api/pull-requests/**`): the
 * records the forge adapters produce, the routes serialize and the browser
 * reads. Server and client import these types from here, so a field added on
 * one side is visible to the other. Pure on purpose: no `server-only`, no
 * runtime import.
 *
 * "PR" is the neutral vocabulary; a GitLab merge request uses the same types
 * (`number` is its `iid`).
 */

/** Minddy's four PR states. Merged wins over closed, draft only applies while open. */
export type PullRequestState = "draft" | "open" | "merged" | "closed";

export const PULL_REQUEST_STATES = ["draft", "open", "merged", "closed"] as const satisfies
  readonly PullRequestState[];

export function isPullRequestState(value: unknown): value is PullRequestState {
  return (PULL_REQUEST_STATES as readonly unknown[]).includes(value);
}

/** Verdict of a review, in neutral vocabulary (GitHub: APPROVE / REQUEST_CHANGES / COMMENT). */
export type ReviewVerdict = "approve" | "request_changes" | "comment";

export const REVIEW_VERDICTS = ["approve", "request_changes", "comment"] as const satisfies
  readonly ReviewVerdict[];

export interface ForgeAccount {
  login: string;
  avatar_url: string | null;
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
  /** Provider-qualified head name used by GitHub's classic merge title. */
  headLabel?: string;
  /** `true` only when the forge confirms that the head branch lives in the base repository. */
  headFromBaseRepository?: boolean;
  base?: string;
  /** Head SHA: the exact diff served, and the anchor of the merge base. */
  headSha?: string;
  /** Number of PR commits, as counted by the forge. GitHub returns it when
      fetching one PR (never in the list); GitLab does not return it, so it stays
      `undefined` and the caller falls back to the commit list length. */
  commitCount?: number;
  /** Author and opening date: `body` opens the thread as a comment, it needs its header. */
  user?: ForgeAccount | null;
  createdAt?: string;
  /** Last activity at the forge; the "(edited)" marker of the body reads it. */
  updatedAt?: string;
  mergedAt?: string | null;
  /** GraphQL identifier of the PR, the only key GitHub's draft/ready
      mutations accept. Never set on GitLab. */
  nodeId?: string;
  /** `null`/`undefined` means unknown, not "no": GitHub computes mergeability
      asynchronously (a fresh PR answers `mergeable: null` for a few seconds),
      and its list endpoint does not return the field at all. */
  mergeable?: boolean | null;
  /** `clean`, `blocked` (the repository requires approvals or checks), `dirty`
      (conflict), `unstable` (optional checks are failing), or `unknown`. */
  mergeableState?: string | null;
  /** Provider refusal normalized to one actionable reason. */
  mergeabilityReason?: MergeabilityReason | null;
  mergeFlowActive?: boolean;
  reviewDecision?: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  /** Direct reviewer requests that are still pending at the forge. */
  requestedReviewers?: ForgeAccount[];
  /** Fully rendered GitLab defaults for the merge dialog. */
  defaultMergeCommitMessage?: string | null;
  defaultSquashCommitMessage?: string | null;
}

export type CheckRerunRef = { kind: "github_check_suite" | "gitlab_pipeline"; id: number };

export interface PullRequestCheck {
  name: string;
  state: CheckState;
  /**
   * A pending check that has not started yet: waiting for a runner, an
   * approval or a resource. Only a running check has a clock to show. Absent
   * on reads cached before the field existed, and always false for commit
   * statuses, whose API cannot tell the two apart.
   */
  queued?: boolean;
  /** Check page at the forge, when it exists. */
  url: string | null;
  /** The integration that produced the check ("GitHub Actions", "Vercel"…).
      `null` when the check name already carries it. */
  appName: string | null;
  /** Its logo at the forge. `null` (GitLab exposes none) falls back to the forge icon. */
  appAvatarUrl: string | null;
  /** The one-line result supplied by the provider ("Deployment has completed"). */
  description: string | null;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  /** `null` means the provider or current token did not expose requiredness. */
  required: boolean | null;
  /** Opaque provider action the server uses to retry this check. */
  rerunRef: CheckRerunRef | null;
}

export interface ChecksSummary {
  checks: PullRequestCheck[];
  /** Stable branch or pull-request preview advertised by a successful check. */
  deploymentUrl?: string | null;
  /**
   * Aggregated state: pending while work remains, then failure, otherwise
   * success. `null` means the repository has no check at all, which differs
   * from `checks: null` in a response ("could not read").
   */
  state: CheckState | null;
  /** Non-blocking checks (successful or neutral): the `n` of "n/m passed". */
  passing: number;
  total: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PullRequestReviewSummary {
  approvals: number;
  changesRequested: number;
  requiredApprovals?: number | null;
}

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  /** Path before the PR when the file was renamed: it addresses the base version. */
  previous_filename?: string;
}

/**
 * A PR commit. Two authors that do not say the same thing: `author` is the
 * forge account, when the forge matched the commit email to one; `authorName`
 * is the name written in the commit, which git always has. GitLab's MR commit
 * API serves no account, so only the second exists there.
 */
export interface PullRequestCommit {
  sha: string;
  /** Full message: first line = title, the rest = body. */
  message: string;
  author: ForgeAccount | null;
  authorName: string | null;
  /** Author email: the key that deduplicates co-signers from the main author. */
  authorEmail: string | null;
  authoredAt: string | null;
  url: string | null;
  /** Signature verified. `null` means unknown (GitLab does not serve it), not "unsigned". */
  verified: boolean | null;
  /** First parent: the "before" side of this commit's own diff. `null` on a root commit. */
  parentSha: string | null;
  /** Lines added and removed by this commit; `null` when the forge could not tell. */
  additions: number | null;
  deletions: number | null;
  /** Every author, main one first (MIN-159): co-signed commits have several.
      Optional because a tab kept open across a deployment may still hold a
      cached response from before the field existed. */
  authors?: CommitAuthor[];
}

/**
 * A forge account that can be mentioned on a PR (MIN-162). Not a minddy
 * member: a `@` in a PR comment only notifies an account of that forge.
 */
export interface RepoMember {
  /** The name as written after the at sign. */
  login: string;
  avatar_url: string | null;
  /** Display name when the forge has one (GitLab), otherwise `null`. */
  name: string | null;
}

/** A message of the PR conversation thread. */
export interface PullRequestComment {
  id: number;
  body: string;
  user: ForgeAccount | null;
  created_at: string;
  /** Last edit at the forge, for the "(edited)" marker. `null` when the forge
      never carried it; compare against `created_at` to decide. */
  updated_at?: string | null;
  html_url: string;
}

/**
 * A review comment, anchored to a line of the diff, as opposed to
 * `PullRequestComment` in the flat conversation thread.
 *
 * `line` is the line in the current version of the PR, `original_line` the
 * one at the commit where the comment was posted. GitHub sets `line: null`
 * once it can no longer attach the comment to the current diff, but a non-null
 * `line` does not prove the line is still in the diff: only the resolution in
 * the rendered hunks decides (see `pr-diff`).
 */
export interface PullRequestReviewComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  original_line: number | null;
  side: "LEFT" | "RIGHT";
  /** First line of a multi-line remark (MIN-181); `line` is then the last.
      Always `null` on GitLab, where a note is anchored to one line. */
  start_line: number | null;
  /** First line at the original commit, kept once the thread is outdated. */
  original_start_line: number | null;
  start_side: "LEFT" | "RIGHT" | null;
  /** Thread root, or `null` when this comment is the root. */
  in_reply_to_id: number | null;
  /** Review that carries this comment (MIN-159). `null` on GitLab, which has no review object. */
  review_id: number | null;
  /** Diff excerpt around the line at comment time (empty on GitLab). */
  diff_hunk: string;
  user: ForgeAccount | null;
  created_at: string;
  html_url: string;
}

/**
 * What the current user can do on this PR (MIN-144). A human gesture is sent
 * under that person's own git account, so without a connected account, or
 * without rights on the repository, minddy says so instead of offering a
 * button that would misattribute the gesture.
 *
 * The server always fills every field; the optional ones were added later and
 * may be absent from a response a tab cached before the deployment.
 */
export interface PrViewer {
  provider: RepoProviderId;
  /** The provider can authorize an account (a self-hosted instance may lack its env). */
  configured: boolean;
  connected: boolean;
  /** An account is connected but the forge refuses its token: it needs a new
      authorization, not more rights on the repository. */
  expired?: boolean;
  login: string | null;
  /** Avatar of the connected forge account that will author human actions. */
  avatarUrl?: string | null;
  /** `write` = merge/resolve, `read` = review/comment, `none` = nothing. */
  capability: "write" | "read" | "none";
  /**
   * The account under which Numo writes at the forge (MIN-162), so the thread
   * can recognize its messages. `null` on GitLab, where Numo uses the account
   * of the person who linked the repository (MIN-146) and no login tells them
   * apart.
   */
  numoLogin?: string | null;
  /** The viewer only reads every linking project (Reader role, MIN-693):
      every PR action is refused whatever the forge account may do. */
  projectReadOnly?: boolean;
}

/**
 * GET `/api/pull-requests/[prId]`. Two kinds of "no checks": `checks: null`
 * means they could not be read (`checksError` says why; `forbidden` is a
 * GitHub permission the installation did not accept), `checks.total === 0`
 * means the repository has no CI. The same goes for `reviews: null`.
 */
export interface PullRequestDetailResponse {
  pr: PullRequestRef | null;
  files: PullRequestFile[];
  provider?: RepoProviderId;
  checks?: ChecksSummary | null;
  checksError?: "forbidden" | "unknown" | null;
  /** The preview a check advertises; the deployment card has its own route. */
  deploymentUrl?: string | null;
  reviews?: PullRequestReviewSummary | null;
  viewer?: PrViewer;
  mergeMethods?: MergeMethod[];
  mergePolicy?: RepositoryMergePolicy | null;
  readiness?: PullRequestReadiness | null;
  reviewThreads?: ReviewThreadState[] | null;
}

/** An issue linked to a PR, as the list and its linked-issues popover show it. */
export interface PullRequestLinkedIssue {
  id: string;
  number: number;
  title: string;
  project_id: string;
  project_key: string;
  status?: IssueStatus;
}

/**
 * One row of the global Pull Requests page (MIN-66, MIN-143): the item is the
 * PR. The server fills every field; the optional ones may be absent from a
 * cached response older than them.
 */
export interface PullRequestListItem {
  prId: string;
  /** The viewer authored this PR at the forge. */
  createdByMe?: boolean;
  /** The viewer has a pending review request at the forge. */
  reviewRequestedForMe?: boolean;
  pr_number: number;
  pr_url: string | null;
  pr_state: PullRequestState;
  /** Repository provider: drives the PR/MR vocabulary and links (MIN-69). */
  provider: RepoProviderId;
  title: string | null;
  /** Who opened the PR at the forge. */
  author: ForgeAccount | null;
  head_branch: string | null;
  created_at: string;
  updated_at: string;
  issue: { id: string; number: number; title: string } | null;
  issues?: PullRequestLinkedIssue[];
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    orb_seed: string | null;
  } | null;
}

// ── Actions of POST /api/pull-requests/[prId] ───────────────────────────────

/** Actions that move the PR between states. */
export const PR_STATE_ACTIONS = [
  "merge",
  "close",
  "reopen",
  "ready_for_review",
  "convert_to_draft",
] as const;
export type PrStateAction = (typeof PR_STATE_ACTIONS)[number];

/** Actions that change the PR without changing its state. */
export const PR_MAINTENANCE_ACTIONS = [
  "update_branch",
  "rerun_check",
  "update_title",
  "update_body",
  "enable_auto_merge",
  "disable_auto_merge",
] as const;
export type PrMaintenanceAction = (typeof PR_MAINTENANCE_ACTIONS)[number];

export const PR_ACTIONS = [
  ...PR_STATE_ACTIONS,
  ...PR_MAINTENANCE_ACTIONS,
  "review",
  "merge_with_numo",
  "link_issue",
  "unlink_issue",
] as const;
export type PrAction = (typeof PR_ACTIONS)[number];

export function isPrAction(value: unknown): value is PrAction {
  return typeof value === "string" && (PR_ACTIONS as readonly string[]).includes(value);
}
