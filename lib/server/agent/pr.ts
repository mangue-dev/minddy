import "server-only";

import { GITHUB_API_BASE, githubHeaders } from "@/lib/server/git/github-rest";
import { collectSignedAssets } from "@/lib/forge-image-assets";
import {
  summarizeGithubChecks,
  type ChecksSummary,
  type RawCheckRun,
  type RawCommitStatus,
} from "./checks-core";

import type { ReviewThreadState } from "@/lib/pr-review-threads";
import {
  PR_BODY_COMMENT_ID,
  type ReviewCommentReaction,
  type ReviewReactionContent,
} from "@/lib/pr-review-reactions";
import {
  fromGithubTimeline,
  type PrTimelineEvent,
  type RawGithubTimelineEvent,
} from "@/lib/pr-timeline";
import type { CommitAuthor } from "@/lib/commit-authors";
import { reviewFallbackPrefix } from "./review-copy";
import {
  mapGithubMergePolicy,
  unavailableMergePolicy,
  type GithubBranchPolicyInput,
  type GithubRepositoryPolicyInput,
  type GithubRuleInput,
  type MergeabilityReason,
  type RepositoryMergePolicy,
} from "@/lib/pr-readiness";

/**
 * GitHub Pull Request Operations for Code Agent (MIN-46): Open PR
 * of a run, read it (metadata + files/patches for in-app review),
 * merge or close it. All scoped by a fresh installation token
 * (getInstallationToken via resolveRepoCloneTarget). `repoFullName` = `owner/name`.
 */

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
  base?: string;
  /** Head SHA — immutable anchor to calculate the merge base (getMergeBaseSha). */
  headSha?: string;
  /** Number of PR commits, as counted by the forge. GitHub returns it when
      fetching one PR (never in the list); GitLab does not return it, so it stays
      `undefined` and the caller falls back to the commit list length. */
  commitCount?: number;
  /** Author and opening date: `body` opens the thread as a comment, it needs its header. */
  user?: { login: string; avatar_url: string | null } | null;
  createdAt?: string;
  /** Last activity AT THE FORGE — sorting the PR list (MIN-143). */
  updatedAt?: string;
  /** Merger date, when there is one (MIN-143: the table keeps it). */
  mergedAt?: string | null;
  /** GraphQL identifier of the PR — only key accepted by mutations (MIN-138:
      the draft → ready toggle ONLY exists in GraphQL). GitLab: never populated. */
  nodeId?: string;
  /** Can PR be merged? `null`/`undefined` = UNKNOWN, not “no”:
      GitHub calculates mergeability asynchronously (verified — a fresh PR
      responds `mergeable: null` + `mergeable_state: "unknown"` for a few
      seconds), and the *list* endpoint does not return these two fields at all. */
  mergeable?: boolean | null;
  /** Detailed mergeability status: `clean`, `blocked` (the repository requires
      approvals or checks), `dirty` (conflict), `unstable` (optional checks are
      failing), or `unknown`. */
  mergeableState?: string | null;
  mergeabilityReason?: MergeabilityReason | null;
  mergeFlowActive?: boolean;
  reviewDecision?: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  /** Fully rendered GitLab defaults for the merge dialog. */
  defaultMergeCommitMessage?: string | null;
  defaultSquashCommitMessage?: string | null;
}

/** Verdict of a review, in neutral vocabulary (GitHub: APPROVE / REQUEST_CHANGES / COMMENT). */
export type ReviewVerdict = "approve" | "request_changes" | "comment";

/**
 * What REALLY happened at the forge when minddy submitted a review.
 *
 * `"review"`: the verdict is published as is. `"comment"`: the forge refused
 * self-review — Numo PRs are opened by the GitHub App bot, and
 * GitHub responds 422 “Can not approve your own pull request” (measured, cf. the
 * spike of MIN-138). The verdict then goes into comment, prefixed with its value,
 * and it is minddy who keeps track of the real verdict (event `pr_approved` /
 * `pr_changes_requested`). The caller tells the user: approve from
 * minddy does not check the green box on GitHub.
 */
export interface ReviewSubmission {
  published: "review" | "comment";
}

/** PR approval count — everything minddy shows about it. */
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
  /** Path BEFORE the PR if the file has been renamed — it addresses the base version. */
  previous_filename?: string;
}

/**
 * A PR commit — what the Commits tab shows.
 *
 * TWO authors, who do not say the same thing: `author` is the ACCOUNT of the
 * forge, when she was able to attach the commit email to a user (it's him
 * which bears the avatar and the login), while `authorName` is the name written IN
 * the commit, which git always has. A commit pushed from a machine whose
 * the email is not declared at the forge only has the second — and on the GitLab side,
 * whose MR commits API does not serve any account, there is never just him.
 */
export interface PullRequestCommit {
  sha: string;
  /** COMPLETE message: first line = title, the rest = body (often empty). */
  message: string;
  author: { login: string; avatar_url: string | null } | null;
  authorName: string | null;
  /** Author email — the only key that duplicates a co-signer from
      the main author when neither form bears any account. */
  authorEmail: string | null;
  authoredAt: string | null;
  url: string | null;
  /** Signature verified by the forge. `null` = UNKNOWN, not “unsigned”:
      GitLab does not serve it on this endpoint (one call per commit is required). */
  verified: boolean | null;
  /**
   * FIRST parent — the “before” side of the diff of this commit alone. It is he who
   * addresses the base version of a file to context unfolding. `null` on a
   * root commit (no parent), where there is nothing to unfold before.
   */
  parentSha: string | null;
  /** Lines added and removed by this commit. `null` means not yet read because
      neither forge includes these figures in the list (see `…CommitExtras`). */
  additions: number | null;
  deletions: number | null;
  /**
   * All authors, including the primary one (MIN-159). A co-signed commit has
   * several, which is common when an agent authored the change. Empty until
   * `…CommitExtras` responds; the caller then falls back to `author` and
   * `authorName`, which represent only the primary author.
   */
  authors: CommitAuthor[];
}

/** What the commits list does NOT carry, and which a second call will fetch:
    the weight of each commit, and its authors resolved into forge counts. */
export interface CommitExtras {
  additions: number;
  deletions: number;
  /** Authors, principal at the head, duplicated BY THE FORGE. Empty when she
      does not know how to resolve them (GitLab): the fallback then reads the trailers. */
  authors: CommitAuthor[];
}

/** The diff of ONE commit against its parent: the “what this commit changes” view. */
export interface CommitDiff {
  files: PullRequestFile[];
  additions: number;
  deletions: number;
  url: string | null;
  parentSha: string | null;
}

/**
 * A FORGE account that can be mentioned on a PR (MIN-162) — not a
 * member minddy: the comment goes to the forge, where a `@` does not designate
 * someone only if he designates an account from there.
 */
export interface RepoMember {
  /** The name as it is written after the at sign — `@login`, raw. */
  login: string;
  avatar_url: string | null;
  /** Name displayed when the forge has one (GitLab), otherwise the login only. */
  name: string | null;
}

/** PR conversation comment (GitHub endpoint issues/{n}/comments). */
export interface PullRequestComment {
  id: number;
  body: string;
  user: { login: string; avatar_url: string | null } | null;
  created_at: string;
  html_url: string;
}

/**
 * REVIEW comment: anchored to a line in the diff (endpoint pulls/{n}/comments),
 * where `PullRequestComment` lives in the flat thread of the conversation.
 *
 * `line` is the line in the CURRENT version of the PR, `original_line` that of
 * commit where the comment was posted. GitHub puts `line: null` when it doesn't know
 * no longer attach the comment to the current diff (“outdated”) — but the opposite
 * is NOT true: `line` not null does not guarantee that the line is in the diff
 * (checked against the API: a comment placed on a CONTEXT line keeps its
 * `line` even after the diff has moved elsewhere in the file). Side
 * rendered, only the effective resolution in the hunks is authentic.
 */
export interface PullRequestReviewComment {
  id: number;
  body: string;
  path: string;
  /** Line in the current diff, or null if GitHub no longer knows how to attach it. */
  line: number | null;
  /** Line at the original commit — the display fallback when `line` is null. */
  original_line: number | null;
  side: "LEFT" | "RIGHT";
  /** First line of a MULTI-LINE remark (MIN-181) — `line` is then
      the LAST. `null` on a single line remark, and always `null`
      on the GitLab side, where a note is anchored on a line. Without these two fields, a
      remark made on lines 6 to 15 is reread as a remark on the
      15: the anchor is right, the beach has disappeared. */
  start_line: number | null;
  /** First line at the original commit, retained after the thread becomes outdated. */
  original_start_line: number | null;
  start_side: "LEFT" | "RIGHT" | null;
  /** Thread root (GitHub standardizes: replying to a reply points to the root). */
  in_reply_to_id: number | null;
  /** Review which bears this comment (MIN-159) — the key which stores it under it
      in the conversation thread. `null` on the GitLab side, which has no review object. */
  review_id: number | null;
  /** Excerpt from the diff around the line, as at the time of the comment. */
  diff_hunk: string;
  user: { login: string; avatar_url: string | null } | null;
  created_at: string;
  html_url: string;
}

/**
 * The state of a FIL (resolution) lives in the pure module `lib/pr-review-threads` —
 * it is shared with the client, who matches the two lists for rendering. Re-exported
 * here so that `mr.ts` and `forge.ts` import it like other PR types.
 */
export type { ReviewThreadState } from "@/lib/pr-review-threads";
export type {
  ReviewCommentReaction,
  ReviewReactionContent,
} from "@/lib/pr-review-reactions";
export type { PrTimelineEvent } from "@/lib/pr-timeline";
export type { CommitAuthor } from "@/lib/commit-authors";

/** GitHub API error with HTTP status (allows you to distinguish 422 “no commits”). */
export class GithubApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GithubApiError";
    this.status = status;
  }
}

function splitRepo(repoFullName: string): { owner: string; repo: string } {
  const [owner, repo] = repoFullName.split("/");
  return { owner, repo };
}

/**
 * GitHub error message, DETAILS INCLUDED.
 *
 * On a 422, `message` is only “Unprocessable Entity”: the real pattern is
 * in `errors[]` — and it is he who distinguishes “cannot approve his own
 * pull request” from an invalid body (checked against API, MIN-138). THE
 * entries are sometimes bare strings, sometimes `{message}` objects or
 * `{resource, field, code}`: the three forms exist depending on the endpoint.
 */
function githubErrorMessage(data: unknown, status: number): string {
  const body = (data ?? {}) as { message?: string; errors?: unknown };
  const base = body.message ?? `GitHub API error (${status})`;
  if (!Array.isArray(body.errors)) return base;
  const details = body.errors
    .map((e) => {
      if (typeof e === "string") return e;
      const o = (e ?? {}) as { message?: string; field?: string; code?: string };
      return o.message ?? [o.field, o.code].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  return details.length > 0 ? `${base}: ${details.join(", ")}` : base;
}

async function ghJson<T>(
  url: string,
  token: string,
  init?: RequestInit & { accept?: string },
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...githubHeaders(token, init?.accept), ...init?.headers },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) throw new GithubApiError(githubErrorMessage(data, res.status), res.status);
  return data as T;
}

/**
 * Text variant of `ghJson`: with `Accept: application/vnd.github.raw` GitHub
 * serves the contents of the file as is, not JSON (and up to 100 MB, where the
 * JSON response caps at 1 MB). 404 → null (file missing at this ref).
 */
async function ghRawText(url: string, token: string): Promise<string | null> {
  const res = await fetch(url, { headers: githubHeaders(token, "application/vnd.github.raw") });
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    let message = `GitHub API error (${res.status})`;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {
      // Non-JSON body (raw): we keep the default message.
    }
    throw new GithubApiError(message, res.status);
  }
  return text;
}

interface RawPull {
  number: number;
  html_url: string;
  node_id?: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  mergeable?: boolean | null;
  mergeable_state?: string | null;
  title?: string;
  body?: string | null;
  head?: { ref?: string; sha?: string; label?: string };
  base?: { ref?: string };
  commits?: number;
  user?: { login?: string; avatar_url?: string } | null;
  created_at?: string;
  updated_at?: string;
  auto_merge?: object | null;
}

/**
 * `toRef` serves both the single-PR GET and `listPullRequests`. The list endpoint
 * returns none of `mergeable`, `mergeable_state`, or `merged`, so these fields
 * remain `undefined`. This is intentional and does not affect branch cleanup,
 * which does not read them, but callers must distinguish `undefined` (“no
 * information”) from `false` (“definitely not mergeable”).
 */
function toRef(pr: RawPull): PullRequestRef {
  return {
    number: pr.number,
    url: pr.html_url,
    state: pr.state,
    draft: pr.draft,
    merged: pr.merged ?? !!pr.merged_at,
    title: pr.title,
    body: pr.body ?? null,
    head: pr.head?.ref,
    headLabel: pr.head?.label,
    base: pr.base?.ref,
    headSha: pr.head?.sha,
    commitCount: pr.commits,
    user: pr.user ? { login: pr.user.login ?? "", avatar_url: pr.user.avatar_url ?? null } : null,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at ?? null,
    nodeId: pr.node_id,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state,
    mergeabilityReason: githubMergeabilityReason(pr),
    mergeFlowActive: !!pr.auto_merge,
  };
}

function githubMergeabilityReason(pr: RawPull): MergeabilityReason | null {
  if (pr.draft) return "draft";
  switch (pr.mergeable_state) {
    case "clean":
    case "unstable":
      return "clean";
    case "behind":
      return "branch_out_of_date";
    case "dirty":
      return "conflicts";
    case "blocked":
      return "policy";
    case "unknown":
      return "checking";
    default:
      return pr.mergeable == null ? null : pr.mergeable ? "clean" : "policy";
  }
}

export function refineGithubMergeabilityReason(
  reason: MergeabilityReason | null | undefined,
  reviewDecision: PullRequestRef["reviewDecision"],
): MergeabilityReason | null | undefined {
  if (reason !== "clean" && reason !== "policy") return reason;
  if (reviewDecision === "CHANGES_REQUESTED") return "changes_requested";
  if (reviewDecision === "REVIEW_REQUIRED") return "approval_required";
  return reason;
}

/** PR open for `head` (run branch), or null. */
export async function findOpenPullRequest(opts: {
  token: string;
  repoFullName: string;
  head: string;
}): Promise<PullRequestRef | null> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const pulls = await ghJson<RawPull[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${encodeURIComponent(opts.head)}`,
    opts.token,
  );
  return pulls.length > 0 ? toRef(pulls[0]) : null;
}

/**
 * Opens the PR of the run, or returns the one already open for this branch (resume).
 * Raises GithubApiError(422) “No commits between…” if the branch has no diff.
 */
export async function ensurePullRequest(opts: {
  token: string;
  repoFullName: string;
  head: string;
  base: string;
  title: string;
  body: string;
}): Promise<PullRequestRef> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  try {
    const created = await ghJson<RawPull>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls`,
      opts.token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: opts.title,
          head: opts.head,
          base: opts.base,
          body: opts.body,
        }),
      },
    );
    return toRef(created);
  } catch (err) {
    // 422 “A pull request already exists” → we find and return the existing one.
    if (err instanceof GithubApiError && err.status === 422) {
      const existing = await findOpenPullRequest({
        token: opts.token,
        repoFullName: opts.repoFullName,
        head: opts.head,
      });
      if (existing) return existing;
    }
    throw err;
  }
}

export async function getPullRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestRef> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const pr = await ghJson<RawPull>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}`,
    opts.token,
  );
  const ref = toRef(pr);
  if (pr.node_id) {
    const flow = await ghGraphql<{
      node?: {
        mergeQueueEntry?: { id?: string } | null;
        autoMergeRequest?: { enabledAt?: string } | null;
        reviewDecision?: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
      } | null;
    }>(
      opts.token,
      "query($id:ID!){node(id:$id){... on PullRequest{mergeQueueEntry{id} autoMergeRequest{enabledAt} reviewDecision}}}",
      { id: pr.node_id },
    ).catch(() => null);
    ref.mergeFlowActive = !!(flow?.node?.mergeQueueEntry || flow?.node?.autoMergeRequest);
    ref.reviewDecision = flow?.node?.reviewDecision ?? null;
    ref.mergeabilityReason = refineGithubMergeabilityReason(
      ref.mergeabilityReason,
      ref.reviewDecision,
    );
  }
  return ref;
}

/** Repository method settings plus the protection rules of this PR's base branch. */
export async function getRepositoryMergePolicy(opts: {
  token: string;
  repoFullName: string;
  number: number;
  base: string;
}): Promise<RepositoryMergePolicy> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const repository = await ghJson<GithubRepositoryPolicyInput>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}`,
    opts.token,
  );
  const [branchSummary, branchResult, rules] = await Promise.all([
    ghJson<{ protected?: boolean }>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${encodeURIComponent(opts.base)}`,
      opts.token,
    ),
    ghJson<GithubBranchPolicyInput>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${encodeURIComponent(opts.base)}/protection`,
      opts.token,
    ).catch((error) => {
      if (error instanceof GithubApiError && error.status === 404) return null;
      if (error instanceof GithubApiError && error.status === 403) return "forbidden" as const;
      throw error;
    }),
    ghJson<GithubRuleInput[]>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/rules/branches/${encodeURIComponent(opts.base)}?per_page=100`,
      opts.token,
    ).catch((error) => {
      // Older GitHub Enterprise instances do not expose rulesets. Branch
      // protection remains authoritative there.
      if (error instanceof GithubApiError && error.status === 404) return [];
      throw error;
    }),
  ]);
  // Reading legacy branch protection requires `Administration: read`, while
  // active rulesets are available through the branch-rules endpoint. Do not
  // discard a complete modern ruleset merely because the legacy endpoint is
  // forbidden. Conversely, a protected branch with no readable ruleset remains
  // unavailable: treating an unknown legacy protection as permissive would make
  // Minddy offer a merge that GitHub can reject.
  if (branchResult === "forbidden" && branchSummary.protected && rules.length === 0) {
    return unavailableMergePolicy("github", "forbidden");
  }
  return mapGithubMergePolicy(
    repository,
    branchResult === "forbidden" ? null : branchResult,
    rules,
  );
}

const FILES_PER_PAGE = 100;
/**
 * GitHub caps this endpoint at 3,000 files: thirty pages cover it in
 * entire. A PR that exceeds this exists (a repository migration, a lockfile
 * regenerated), and this is precisely where the truncation must be SAYED — a reader
 * He who ignores what he has not seen concludes on what he has seen.
 */
const FILES_MAX_PAGES = 30;

/**
 * PR files with their patches (unified diff) — feeds the review
 * in-app, diff view and initiating a replay session.
 *
 * PAGINATED (MIN-168). A single page served 100 and said nothing: beyond that,
 * the following files disappeared without a trace — the caller did not
 * couldn't even know he was missing it. `truncated` is the half that
 * missing: it says that the list stops at the ceiling, not that the deposit stops
 * there.
 */
export async function listPullRequestFiles(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<{ files: PullRequestFile[]; truncated: boolean }> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const files: PullRequestFile[] = [];
  let truncated = false;
  for (let page = 1; page <= FILES_MAX_PAGES; page++) {
    const batch = await ghJson<
      Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        patch?: string;
        previous_filename?: string;
      }>
    >(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/files` +
        `?per_page=${FILES_PER_PAGE}&page=${page}`,
      opts.token,
    );
    files.push(
      ...batch.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
        previous_filename: f.previous_filename,
      })),
    );
    // Incomplete page = last page.
    if (batch.length < FILES_PER_PAGE) break;
    if (page === FILES_MAX_PAGES) truncated = true;
  }
  return { files, truncated };
}

interface RawCommit {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: { name?: string; email?: string; date?: string } | null;
    verification?: { verified?: boolean } | null;
  } | null;
  author?: { login?: string; avatar_url?: string } | null;
  parents?: Array<{ sha?: string }>;
}

function toCommit(c: RawCommit): PullRequestCommit {
  return {
    sha: c.sha,
    message: c.commit?.message ?? "",
    author: c.author
      ? { login: c.author.login ?? "", avatar_url: c.author.avatar_url ?? null }
      : null,
    authorName: c.commit?.author?.name ?? null,
    authorEmail: c.commit?.author?.email ?? null,
    authoredAt: c.commit?.author?.date ?? null,
    url: c.html_url ?? null,
    verified: c.commit?.verification?.verified ?? null,
    // First parent only: on a merge commit, this is the line
    // main, and it is against it that the two forges differ.
    parentSha: c.parents?.[0]?.sha ?? null,
    // The REST of commits does NOT carry stats (checked against the API): they
    // arrive from elsewhere, and are merged by the caller. The co-authors no
    // more: REST does not read trailers, only GraphQL resolves them.
    additions: null,
    deletions: null,
    authors: [],
  };
}

const COMMITS_PER_PAGE = 100;
/** GitHub caps this endpoint at 250 commits: three pages cover it in
    whole, and a PR which exceeds it can be read at the forge (`truncated` says so). */
const COMMITS_MAX_PAGES = 3;

/**
 * PR commits, from oldest to newest — the order GitHub
 * serves and displays, the one in which the work was done.
 *
 * Paginated for the same reason as review comments: GitHub serves this
 * list in chronological order, so stopping at the first page would
 * disappear the most RECENT commits — precisely the ones we just
 * watch after another push from Numo.
 */
export async function listPullRequestCommits(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<{ commits: PullRequestCommit[]; truncated: boolean }> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const commits: PullRequestCommit[] = [];
  let truncated = false;
  for (let page = 1; page <= COMMITS_MAX_PAGES; page++) {
    const batch = await ghJson<RawCommit[]>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/commits` +
        `?per_page=${COMMITS_PER_PAGE}&page=${page}`,
      opts.token,
    );
    commits.push(...batch.map(toCommit));
    // Incomplete page = last page.
    if (batch.length < COMMITS_PER_PAGE) break;
    if (page === COMMITS_MAX_PAGES) truncated = true;
  }
  return { commits, truncated };
}

interface RawCommitExtras {
  repository?: {
    pullRequest?: {
      commits?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        nodes?: Array<{
          commit?: {
            oid?: string;
            additions?: number;
            deletions?: number;
            authors?: {
              nodes?: Array<{
                name?: string;
                user?: { login?: string; avatarUrl?: string | null } | null;
              } | null>;
            } | null;
          } | null;
        } | null>;
      } | null;
    } | null;
  } | null;
}

/** Beyond that, the stacked avatar is no longer readable — and GitHub collapses too. */
const MAX_COMMIT_AUTHORS = 10;

const COMMIT_EXTRAS_QUERY = `
  query($owner:String!,$name:String!,$number:Int!,$cursor:String){
    repository(owner:$owner,name:$name){
      pullRequest(number:$number){
        commits(first:100, after:$cursor){
          pageInfo{ hasNextPage endCursor }
          nodes{ commit{
            oid additions deletions
            authors(first:${MAX_COMMIT_AUTHORS}){ nodes{ name user{ login avatarUrl } } }
          } }
        }
      }
    }
  }`;

/**
 * What the REST list of commits does not carry: their WEIGHT (+/− lines) and
 * their AUTHORS resolved into forge accounts — indexed by SHA.
 *
 * In GraphQL, and apart from the list, because REST cannot do either
 * the other: `pulls/{n}/commits` carries no stats (checked against the API), and
 * getting them in REST would require a `GET commits/{sha}` PER commit; as for the
 * co-authors, she just doesn't read the `Co-authored-by` trailers.
 * GraphQL does both in one query — and without more than REST permissions
 * equivalent (same observation as the review threads).
 *
 * The two travel together because they come from the same round trip: the
 * separating it would double the cost for nothing.
 *
 * The caller treats the failure as a best effort: without this call, the list is displayed
 * anyway — the +/− indicator disappears, and the authors fall back on the author
 * main plus what the message trailers say.
 */
export async function listPullRequestCommitExtras(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<Map<string, CommitExtras>> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const extras = new Map<string, CommitExtras>();
  let cursor: string | null = null;
  for (let page = 1; page <= COMMITS_MAX_PAGES; page++) {
    const data: RawCommitExtras = await ghGraphql<RawCommitExtras>(
      opts.token,
      COMMIT_EXTRAS_QUERY,
      { owner, name: repo, number: opts.number, cursor },
    );
    const connection = data.repository?.pullRequest?.commits;
    for (const node of connection?.nodes ?? []) {
      const c = node?.commit;
      if (!c?.oid) continue;
      extras.set(c.oid, {
        additions: c.additions ?? 0,
        deletions: c.deletions ?? 0,
        // MEASURED: GitHub puts the primary author first, followed by co-signers,
        // already deduplicated by email. A trailer that repeats the author adds no
        // entry. It also resolves accounts, including `noreply@anthropic.com`
        // (to `claude`), which REST does not do.
        authors: (c.authors?.nodes ?? []).flatMap((a) => {
          const name = a?.name?.trim();
          if (!name && !a?.user?.login) return [];
          return [
            {
              login: a?.user?.login ?? null,
              name: name || (a?.user?.login as string),
              // Use only the account avatar: `GitActor.avatarUrl` returns an
              // identicon for an unknown email, which would look like a photo.
              avatar_url: a?.user?.avatarUrl ?? null,
            },
          ];
        }),
      });
    }
    if (!connection?.pageInfo?.hasNextPage) break;
    cursor = connection.pageInfo.endCursor ?? null;
    if (!cursor) break;
  }
  return extras;
}

/**
 * The difference of ONE commit against its parent — “what this commit changes”, at
 * same format as the diff of the entire PR (same patches, same rendering).
 *
 * GitHub returns at most 300 files from this endpoint. Beyond that we would need
 * pagination, but a single commit touching 300 files is no longer useful to read
 * file by file anyway.
 */
export async function getCommitDiff(opts: {
  token: string;
  repoFullName: string;
  sha: string;
}): Promise<CommitDiff> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const commit = await ghJson<{
    html_url?: string;
    stats?: { additions?: number; deletions?: number };
    parents?: Array<{ sha?: string }>;
    files?: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
      previous_filename?: string;
    }>;
  }>(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${opts.sha}`, opts.token);

  return {
    files: (commit.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
      previous_filename: f.previous_filename,
    })),
    additions: commit.stats?.additions ?? 0,
    deletions: commit.stats?.deletions ?? 0,
    url: commit.html_url ?? null,
    parentSha: commit.parents?.[0]?.sha ?? null,
  };
}

/** Pages of 100 drained at most for the branch picker — beyond that, a deposit
    has too many branches for an exhaustive list to still be useful for choosing. */
const MAX_BRANCH_PAGES = 5;

/**
 * Repository branch names (agent launch base branch picker).
 * Paged up to MAX_BRANCH_PAGES × 100 — sorting (default first) is done by
 * the caller, GitHub does not offer either sorting or searching on this endpoint.
 */
export async function listBranches(opts: {
  token: string;
  repoFullName: string;
}): Promise<string[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const names: string[] = [];
  for (let page = 1; page <= MAX_BRANCH_PAGES; page++) {
    const batch = await ghJson<Array<{ name: string }>>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches?per_page=100&page=${page}`,
      opts.token,
    );
    names.push(...batch.map((b) => b.name));
    if (batch.length < 100) break;
  }
  return names;
}

/** Two pages = 200 accounts. Beyond that, a list of suggestions no longer helps
    person: you type three letters, you don't pull out a directory. */
const MAX_MEMBER_PAGES = 2;

/**
 * The GitHub accounts that can be mentioned on this repository (MIN-162) — its
 * collaborators, `affiliation=all` (direct members, inherited from the organization
 * and outgoing). This is the list that GitHub itself offers under a `@`.
 *
 * The installation token is enough: it is a READ, like all those of the
 * PR view. It asks for “Members” (read) permission on the installation —
 * without it GitHub responds 403, and the caller returns an empty list rather than one
 * error: we write a comment very well without suggesting a mention.
 */
export async function listRepoMembers(opts: {
  token: string;
  repoFullName: string;
}): Promise<RepoMember[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const members: RepoMember[] = [];
  for (let page = 1; page <= MAX_MEMBER_PAGES; page++) {
    const batch = await ghJson<Array<{ login?: string; avatar_url?: string }>>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/collaborators` +
        `?affiliation=all&per_page=100&page=${page}`,
      opts.token,
    );
    for (const c of batch) {
      if (c.login) members.push({ login: c.login, avatar_url: c.avatar_url ?? null, name: null });
    }
    if (batch.length < 100) break;
  }
  return members;
}

/** Same spirit as MAX_BRANCH_PAGES: 500 PR is enough for a household of branches,
    and the order `updated desc` puts the most recent — the only ones still alive
    in the user's head — on the first page. */
const MAX_PR_PAGES = 5;

/**
 * ALL PRs in the repository, all states combined (MIN-102, cleaning of branches
 * agent). `state=all` is essential: `state=closed` from GitHub covers the
 * refused AND merged, but we also want to see the PRs OPEN so as not to
 * never propose the deletion of a branch which carries one.
 *
 * `truncated` warns the caller that beyond MAX_PR_PAGES × 100 the list is
 * cut — the preview then says it on screen rather than lying by omission.
 */
export async function listPullRequests(opts: {
  token: string;
  repoFullName: string;
}): Promise<{ pulls: PullRequestRef[]; truncated: boolean }> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const pulls: PullRequestRef[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PR_PAGES; page++) {
    const batch = await ghJson<RawPull[]>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls` +
        `?state=all&sort=updated&direction=desc&per_page=100&page=${page}`,
      opts.token,
    );
    // The *list* endpoint does not return `merged`: `toRef` falls back to
    // `merged_at`, only signal available here to distinguish merged/refused.
    pulls.push(...batch.map(toRef));
    if (batch.length < 100) break;
    if (page === MAX_PR_PAGES) truncated = true;
  }
  return { pulls, truncated };
}

/**
 * Delete a remote branch (MIN-102). Returns `"deleted"`, or
 * `"already-gone"` if the reference no longer exists — a replayed household should not
 * look like a breakdown. GitHub responds 422 “Reference does not exist” (and
 * no 404) when the ref has already disappeared.
 */
export async function deleteBranch(opts: {
  token: string;
  repoFullName: string;
  branch: string;
}): Promise<"deleted" | "already-gone"> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  // Ref left as is — same reasons as getMergeBaseSha: our branches
  // carry `/` (`minddy/agent/…`) and %2F would break the road.
  try {
    await ghJson<unknown>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs/heads/${opts.branch}`,
      opts.token,
      { method: "DELETE" },
    );
    return "deleted";
  } catch (err) {
    if (err instanceof GithubApiError && (err.status === 422 || err.status === 404)) {
      return "already-gone";
    }
    throw err;
  }
}

/**
 * PR **merge base** SHA — the reference point for GitHub patches.
 *
 * GitHub defers a three-point PR (`base...head`): line numbers
 * "old" patches count from the common ancestor, NOT from the tip of
 * the basic branch. Using `pr.base.sha` is a trap: if the base has advanced
 * since then, the lines have shifted and the expansion has silently injected the bad
 * code. We pass the living branch name (and not `base.sha`, frozen at opening
 * of the PR): if `head` has merged the base in the meantime, the common ancestor has moved
 * and only the live branch gives the one that GitHub actually used.
 */
export async function getMergeBaseSha(opts: {
  token: string;
  repoFullName: string;
  base: string;
  head: string;
}): Promise<string> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  // Refs left as is: branch names with slash (`numo/min-42`) are
  // valid here, and the %2F would break GitHub's compare route.
  const comparison = await ghJson<{ merge_base_commit?: { sha?: string } }>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/compare/${opts.base}...${opts.head}?per_page=1`,
    opts.token,
  );
  const sha = comparison.merge_base_commit?.sha;
  if (!sha) throw new GithubApiError("No merge base for this pull request", 502);
  return sha;
}

/**
 * CUMULATIVE diff of a working branch against its base — the diff view of a session
 * WITHOUT PR (the GitHub comparison serves files in the same format as pulls/{n}/files,
 * from the merge base, like a PR). `?per_page=1` bounds the list of COMMITS
 * embedded in the response: the files are only served on the
 * first page and arrive complete (GitHub ceiling: 300).
 * Raises GithubApiError(404) if the branch has not (yet) been pushed.
 */
export async function compareBranches(opts: {
  token: string;
  repoFullName: string;
  base: string;
  head: string;
}): Promise<{ files: PullRequestFile[]; url: string | null }> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  // Refs left as is — same reasons as getMergeBaseSha (slash branches).
  const comparison = await ghJson<{
    html_url?: string;
    files?: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
      previous_filename?: string;
    }>;
  }>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/compare/${opts.base}...${opts.head}?per_page=1`,
    opts.token,
  );
  return {
    files: (comparison.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
      previous_filename: f.previous_filename,
    })),
    url: comparison.html_url ?? null,
  };
}

/** Segment-by-segment encoded file path: encodeURIComponent would swallow `/`. */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** Raw content of a file at a given ref, or null if it does not exist there. */
export async function getFileAtRef(opts: {
  token: string;
  repoFullName: string;
  path: string;
  ref: string;
}): Promise<string | null> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  return ghRawText(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodePath(opts.path)}?ref=${encodeURIComponent(opts.ref)}`,
    opts.token,
  );
}

/**
 * Same bytes, not decoded: the image version of a diff file (MIN-66).
 * `getFileAtRef` passes through `res.text()`, which interprets the body as UTF-8 and
 * replaces any invalid byte with U+FFFD — a PNG comes out corrupted. This is the
 * the only reason for this duplicate.
 */
export async function getFileBytesAtRef(opts: {
  token: string;
  repoFullName: string;
  path: string;
  ref: string;
}): Promise<ArrayBuffer | null> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodePath(opts.path)}?ref=${encodeURIComponent(opts.ref)}`;
  const res = await fetch(url, { headers: githubHeaders(opts.token, "application/vnd.github.raw") });
  if (res.status === 404) return null;
  if (!res.ok) {
    let message = `GitHub API error (${res.status})`;
    try {
      message = ((await res.json()) as { message?: string }).message ?? message;
    } catch {
      // Non-JSON body (raw): we keep the default message.
    }
    throw new GithubApiError(message, res.status);
  }
  return res.arrayBuffer();
}

export async function mergePullRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
  method?: "merge" | "squash" | "rebase";
  commitTitle?: string;
  commitMessage?: string;
}): Promise<void> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  await ghJson<unknown>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/merge`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merge_method: opts.method ?? "squash",
        ...(opts.commitTitle != null ? { commit_title: opts.commitTitle } : {}),
        ...(opts.commitMessage != null ? { commit_message: opts.commitMessage } : {}),
      }),
    },
  );
}

export async function updatePullRequestBranch(opts: {
  token: string;
  repoFullName: string;
  number: number;
  headSha?: string;
}): Promise<void> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  await ghJson<unknown>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/update-branch`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.headSha ? { expected_head_sha: opts.headSha } : {}),
    },
  );
}

export async function rerunPullRequestCheck(opts: {
  token: string;
  repoFullName: string;
  number: number;
  ref: { kind: "github_check_suite" | "gitlab_pipeline"; id: number };
}): Promise<void> {
  if (opts.ref.kind !== "github_check_suite") {
    throw new GithubApiError("Check cannot be rerun by GitHub", 409);
  }
  const { owner, repo } = splitRepo(opts.repoFullName);
  await ghJson<unknown>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/check-suites/${opts.ref.id}/rerequest`,
    opts.token,
    { method: "POST" },
  );
}

export async function updatePullRequestTitle(opts: {
  token: string;
  repoFullName: string;
  number: number;
  title: string;
}): Promise<PullRequestRef> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const pr = await ghJson<RawPull>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}`,
    opts.token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: opts.title }),
    },
  );
  return toRef(pr);
}

export async function enablePullRequestMergeFlow(opts: {
  token: string;
  repoFullName: string;
  number: number;
  nodeId?: string;
  method?: "merge" | "squash" | "rebase";
  queue: boolean;
  headSha?: string;
}): Promise<void> {
  if (!opts.nodeId) throw new GithubApiError("Pull request has no GraphQL id", 409);
  if (opts.queue) {
    await ghGraphql<unknown>(
      opts.token,
      "mutation($id:ID!){enqueuePullRequest(input:{pullRequestId:$id}){mergeQueueEntry{id}}}",
      { id: opts.nodeId },
    );
    return;
  }
  const method = (opts.method ?? "squash").toUpperCase();
  await ghGraphql<unknown>(
    opts.token,
    "mutation($id:ID!,$method:PullRequestMergeMethod!){enablePullRequestAutoMerge(" +
      "input:{pullRequestId:$id,mergeMethod:$method}){pullRequest{id}}}",
    { id: opts.nodeId, method },
  );
}

export async function closePullRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  await ghJson<unknown>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}`,
    opts.token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "closed" }),
    },
  );
}

/**
 * Reopens a refused PR (MIN-68): a cold run that inherits a PR `closed`
 * reworks its branch - we review the PR rather than opening one
 * second on the same branch. Returns the reopened PR. Fails (422) if the branch
 * head has been deleted in the meantime: the caller then falls back on a new PR.
 */
export async function reopenPullRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestRef> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const pr = await ghJson<RawPull>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}`,
    opts.token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "open" }),
    },
  );
  return toRef(pr);
}

// ── Reviews formelles (MIN-138) ──────────────────────────────────────────────

const GITHUB_REVIEW_EVENT: Record<ReviewVerdict, "APPROVE" | "REQUEST_CHANGES" | "COMMENT"> = {
  approve: "APPROVE",
  request_changes: "REQUEST_CHANGES",
  comment: "COMMENT",
};

/** Is GitHub refusing because the author can't proofread himself?
    Measured: 422 “Review Can not approve your own pull request”. */
function isSelfReviewRefusal(err: unknown): boolean {
  return (
    err instanceof GithubApiError &&
    err.status === 422 &&
    /own pull request/i.test(err.message)
  );
}

/**
 * Submit a review on PR. `approve` and `request_changes` are ATTEMPTED in
 * review event then folded into a comment if GitHub refuses auto-review
 * (the normal case of Numo PRs: they are opened by the GitHub bot
 * App). We're still trying rather than folding straight away: on a GitHub
 * Enterprise, or the day a PR bears another author, the verdict must
 * land for real — the cost is one more round trip on a click.
 *
 * **Everything that is not a verdict goes into the FIL** (`issues/{n}/comments`),
 * never in review `COMMENT`. VERIFIED against the API: the body of a review
 * `COMMENT` only appears in `pulls/{n}/reviews` — it is absent from
 * `issues/{n}/comments`, the only endpoint with which minddy populates the PR thread
 * (`listPullRequestComments`). A text posted in review `COMMENT` is therefore
 * readable on github.com and invisible IN minddy, which affected both
 * most common paths: the “comment” verdict from the Review menu, and the
 * self-review fallback — that is, any approval of a Numo PR.
 * GitLab already did this (`submitMergeRequestReview` → `createMergeRequestNote`):
 * both forges now say the same thing.
 */
export async function submitPullRequestReview(opts: {
  token: string;
  repoFullName: string;
  number: number;
  verdict: ReviewVerdict;
  body: string;
  locale?: string;
}): Promise<ReviewSubmission> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const postReview = (event: string, body: string) =>
    ghJson<unknown>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/reviews`,
      opts.token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, body }),
      },
    );

  // Nothing to publish as a verdict: the text goes where it will be read. `published`
  // remains “review” — no forge has refused anything.
  if (opts.verdict === "comment") {
    await createPullRequestComment(opts);
    return { published: "review" };
  }
  try {
    await postReview(GITHUB_REVIEW_EVENT[opts.verdict], opts.body);
    return { published: "review" };
  } catch (err) {
    if (!isSelfReviewRefusal(err)) throw err;
    // The prefix also guarantees a non-empty body: GitHub accepts an `APPROVE`
    // without a message but rejects an empty comment.
    const body = `${reviewFallbackPrefix(opts.verdict, opts.locale)}\n\n${opts.body}`.trim();
    await createPullRequestComment({ ...opts, body });
    return { published: "comment" };
  }
}

interface RawReview {
  state?: string; // APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED | PENDING
  body?: string | null;
  user?: { login?: string } | null;
  submitted_at?: string | null;
}

/**
 * The TEXT of a review already submitted, with its verdict — what the count
 * of approvals does not say. Read via Numo's replay pass (MIN-141):
 * a point already raised by someone does not need to be raised a second time, and the
 * body of a review lives elsewhere than the thread (`pulls/{n}/reviews`, never
 * `issues/{n}/comments`).
 */
export interface PullRequestReviewMessage {
  author: string | null;
  /** `approved` | `changes_requested` | `commented` | `dismissed`. */
  state: string;
  body: string;
  submittedAt: string | null;
}

/**
 * PR approval count. GitHub keeps ALL review history
 * (approve, then request changes, leave the two lines): only the
 * LATEST sharp review of every user counts, exactly like the
 * repository approval rule. The `COMMENTED` and `DISMISSED` do not decide anything
 * and are therefore ignored, without erasing a previous verdict.
 */
export async function listPullRequestReviews(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestReviewSummary> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const reviews = await ghJson<RawReview[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/reviews?per_page=100`,
    opts.token,
  );
  // The endpoint goes from oldest to newest: last written by
  // login gagne naturellement.
  const verdictByUser = new Map<string, "approved" | "changes_requested">();
  for (const r of reviews) {
    const login = r.user?.login;
    if (!login) continue;
    if (r.state === "APPROVED") verdictByUser.set(login, "approved");
    else if (r.state === "CHANGES_REQUESTED") verdictByUser.set(login, "changes_requested");
  }
  const verdicts = [...verdictByUser.values()];
  return {
    approvals: verdicts.filter((v) => v === "approved").length,
    changesRequested: verdicts.filter((v) => v === "changes_requested").length,
  };
}

/**
 * Reviews already submitted, WITH their text (from oldest to most recent).
 * Same endpoint as the count above, different reading: here we keep what has
 * been WRITTEN. Reviews without a body are ruled out — naked approval does not bring
 * nothing to read again, its existence can already be read in the countdown.
 */
export async function listPullRequestReviewMessages(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestReviewMessage[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const reviews = await ghJson<RawReview[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/reviews?per_page=100`,
    opts.token,
  );
  return reviews
    .filter((r) => (r.body ?? "").trim())
    .map((r) => ({
      author: r.user?.login ?? null,
      state: (r.state ?? "commented").toLowerCase(),
      body: (r.body ?? "").trim(),
      submittedAt: r.submitted_at ?? null,
    }));
}

/**
 * GraphQL call, for what GitHub REST cannot do: switch a
 * PR out of draft (below) and resolve a review thread (MIN-139).
 *
 * GraphQL responds **200 with an array `errors`** when the operation fails:
 * relying on HTTP status would make a failure look like a success. Verified
 * with an installation token — no more permissions than REST
 * equivalent (`pull_requests: read`/`write`).
 */
async function ghGraphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${GITHUB_API_BASE}/graphql`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  type GraphqlBody = { data?: T; errors?: Array<{ message?: string }> };
  let data: GraphqlBody | null = null;
  try {
    data = text ? (JSON.parse(text) as GraphqlBody) : null;
  } catch {
    // Non-JSON body: the status alone will decide.
  }
  if (!res.ok) {
    throw new GithubApiError(
      data?.errors?.[0]?.message ?? `GitHub API error (${res.status})`,
      res.status,
    );
  }
  if (data?.errors?.length) {
    throw new GithubApiError(data.errors[0].message ?? "GraphQL error", 422);
  }
  if (!data?.data) throw new GithubApiError("GitHub returned no data", 502);
  return data.data;
}

/**
 * Switches a draft PR to “ready for review”. REST does not know
 * do: it is a GraphQL mutation, addressed by the `node_id` of the PR (hence
 * `PullRequestRef.nodeId`).
 */
export async function markPullRequestReadyForReview(opts: {
  token: string;
  nodeId: string;
}): Promise<void> {
  await ghGraphql<unknown>(
    opts.token,
    "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id})" +
      "{pullRequest{number isDraft}}}",
    { id: opts.nodeId },
  );
}

/** Switches an open pull request back to draft through GitHub GraphQL. */
export async function convertPullRequestToDraft(opts: {
  token: string;
  nodeId: string;
}): Promise<void> {
  await ghGraphql<unknown>(
    opts.token,
    "mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id})" +
      "{pullRequest{number isDraft}}}",
    { id: opts.nodeId },
  );
}

/**
 * CI checks from the PR head: check runs (GitHub Actions & co) AND
 * commit statuses (the historical API), merged by `checks-core`.
 *
 * Requests `checks: read` and `statuses: read` permissions from the GitHub App.
 * An App that earns them does NOT earn them retroactively — every install
 * existing must accept them (same trap as `getIssuesPermission`). As long as this
 * is not done, GitHub responds **403 “Resource not accessible by integration”**
 * (measured): the caller degrades to “checks unavailable”, it does not break.
 */
export async function listPullRequestChecks(opts: {
  token: string;
  repoFullName: string;
  sha: string;
  requiredCheckNames?: readonly string[] | null;
}): Promise<ChecksSummary> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const base = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${opts.sha}`;
  const [runs, statuses] = await Promise.all([
    ghJson<{ check_runs?: RawCheckRun[] }>(`${base}/check-runs?per_page=100`, opts.token),
    ghJson<{ statuses?: RawCommitStatus[] }>(`${base}/status?per_page=100`, opts.token),
  ]);
  return summarizeGithubChecks(
    runs.check_runs ?? [],
    statuses.statuses ?? [],
    opts.requiredCheckNames ?? null,
  );
}

interface RawComment {
  id: number;
  body?: string;
  user?: { login?: string; avatar_url?: string } | null;
  created_at: string;
  html_url: string;
}

function toComment(c: RawComment): PullRequestComment {
  return {
    id: c.id,
    body: c.body ?? "",
    user: c.user ? { login: c.user.login ?? "", avatar_url: c.user.avatar_url ?? null } : null,
    created_at: c.created_at,
    html_url: c.html_url,
  };
}

/**
 * PR conversation comments (thread). On GitHub a PR
 * IS an issue, so his comments live under `issues/{n}/comments`.
 */
export async function listPullRequestComments(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestComment[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const comments = await ghJson<RawComment[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${opts.number}/comments?per_page=100`,
    opts.token,
  );
  return comments.map(toComment);
}

/**
 * Images from PR comments, indexed by asset uuid (MIN-162).
 *
 * `Accept: application/vnd.github.full+json` asks GitHub to MAKE it
 * markdown: the response then carries a `body_html` where each pasted image is
 * rewritten to a signed, serverable URL without authentication — where the body URL
 * raw (`github.com/user-attachments/assets/…`) responds 404 to everything minddy
 * holds. The why, and the measurement table, are in `lib/forge-image-assets`.
 *
 * Three surfaces, because an image can be anywhere on the PR: its
 * BODY, a thread message, a line remark. They are read in parallel
 * and collected in the same table—the caller wants a UUID, not a location.
 *
 * Best-effort on the surface: a failed read removes images from the table,
 * it does not cause the PR display to fall.
 */
export async function listPullRequestImageAssets(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<Map<string, string>> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const base = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
  const rendered = { accept: "application/vnd.github.full+json" };

  const [pr, comments, reviewComments] = await Promise.all([
    ghJson<{ body_html?: string }>(`${base}/pulls/${opts.number}`, opts.token, rendered),
    ghJson<Array<{ body_html?: string }>>(
      `${base}/issues/${opts.number}/comments?per_page=100`,
      opts.token,
      rendered,
    ),
    ghJson<Array<{ body_html?: string }>>(
      `${base}/pulls/${opts.number}/comments?per_page=100`,
      opts.token,
      rendered,
    ),
  ]);

  return collectSignedAssets([
    pr.body_html,
    ...comments.map((c) => c.body_html),
    ...reviewComments.map((c) => c.body_html),
  ]);
}

const TIMELINE_PER_PAGE = 100;
/** Guardrail: 10 pages = 1000 facts, far beyond the most talkative PR. */
const TIMELINE_MAX_PAGES = 10;

/**
 * PR ACTIVITY (MIN-159) — reviews submitted, commits pushed, labels,
 * assignments, renames, draft ↔ ready, close, merge.
 *
 * On GitHub a PR is an issue, and it all lives under `issues/{n}/timeline`:
 * a heterogeneous flow where each `event` has its own form. Normalization is
 * in `lib/pr-timeline` (pure, shared with the client); here we only do
 * paginate — from OLDEST to newest, like comments.
 *
 * The reviews are part of it (`event: "reviewed"`, with their body): this is what
 * which was missing the most from minddy's thread, a reasoned approval not being there
 * jusqu'ici visible nulle part.
 */
export async function listPullRequestTimeline(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PrTimelineEvent[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const all: RawGithubTimelineEvent[] = [];
  for (let page = 1; page <= TIMELINE_MAX_PAGES; page++) {
    const batch = await ghJson<RawGithubTimelineEvent[]>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${opts.number}/timeline` +
        `?per_page=${TIMELINE_PER_PAGE}&page=${page}`,
      opts.token,
    );
    all.push(...batch);
    // Incomplete page = last page.
    if (batch.length < TIMELINE_PER_PAGE) break;
  }
  return fromGithubTimeline(all);
}

interface RawReviewComment extends RawComment {
  path?: string;
  line?: number | null;
  original_line?: number | null;
  side?: string | null;
  start_line?: number | null;
  original_start_line?: number | null;
  start_side?: string | null;
  in_reply_to_id?: number | null;
  diff_hunk?: string;
  pull_request_review_id?: number | null;
}

function toReviewComment(c: RawReviewComment): PullRequestReviewComment {
  return {
    id: c.id,
    body: c.body ?? "",
    path: c.path ?? "",
    line: c.line ?? null,
    original_line: c.original_line ?? null,
    side: c.side === "LEFT" ? "LEFT" : "RIGHT",
    // Multi-line note: `line` is the LAST line, `start_line` the
    // first. Without rereading these two, a comment on lines 6 to
    // 15 returns from the forge as a commentary on 15 — it is, in the sense
    // of the anchor, but the screen would no longer say anything about the beach.
    start_line: c.start_line ?? null,
    original_start_line: c.original_start_line ?? null,
    start_side: c.start_side === "LEFT" ? "LEFT" : c.start_side === "RIGHT" ? "RIGHT" : null,
    in_reply_to_id: c.in_reply_to_id ?? null,
    review_id: c.pull_request_review_id ?? null,
    diff_hunk: c.diff_hunk ?? "",
    user: c.user ? { login: c.user.login ?? "", avatar_url: c.user.avatar_url ?? null } : null,
    created_at: c.created_at,
    html_url: c.html_url,
  };
}

const REVIEW_COMMENTS_PER_PAGE = 100;
/** Guardrail: 10 pages = 1000 review comments, far beyond reality. */
const REVIEW_COMMENTS_MAX_PAGES = 10;

/**
 * PR review comments — those anchored to one line of code.
 *
 * PAGINATED, unlike its neighbors of this file: GitHub serves this endpoint of the
 * oldest to newest, so stopping at the first page would make it disappear
 * the most RECENT comments — precisely those which carry the request of the
 * day, and which the agent must read. A review thread exceeds 100 much faster
 * that a PR does not exceed 100 files changed.
 */
export async function listPullRequestReviewComments(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestReviewComment[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const all: PullRequestReviewComment[] = [];
  for (let page = 1; page <= REVIEW_COMMENTS_MAX_PAGES; page++) {
    const batch = await ghJson<RawReviewComment[]>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/comments` +
        `?per_page=${REVIEW_COMMENTS_PER_PAGE}&page=${page}`,
      opts.token,
    );
    all.push(...batch.map(toReviewComment));
    // Incomplete page = last page.
    if (batch.length < REVIEW_COMMENTS_PER_PAGE) break;
  }
  return all;
}

/**
 * Post a review comment on one line (equivalent to “Add single
 * comment” from GitHub: it leaves immediately, excluding group review).
 *
 * `commitId` MUST be the head of the PR (`PullRequestRef.headSha`), and the line
 * must belong to the diff. Tests against the real API show that a line outside
 * the diff—typically an expanded context line—is rejected with **422**
 * (`pull_request_review_thread.line: could not be resolved`). The caller must
 * therefore offer this action only on lines from the original hunks.
 *
 * `startLine`/`startSide` are there for multi-line comments (excluding
 * perimeter today): GitHub accepts them on this same endpoint.
 */
export async function createPullRequestReviewComment(opts: {
  token: string;
  repoFullName: string;
  number: number;
  body: string;
  commitId: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
}): Promise<PullRequestReviewComment> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const created = await ghJson<RawReviewComment>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/comments`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: opts.body,
        commit_id: opts.commitId,
        path: opts.path,
        line: opts.line,
        side: opts.side,
        ...(opts.startLine != null ? { start_line: opts.startLine } : {}),
        ...(opts.startSide ? { start_side: opts.startSide } : {}),
      }),
    },
  );
  return toReviewComment(created);
}

/**
 * Reply in a review thread. `commentId` can be any comment
 * from the thread: GitHub attaches the response to the ROOT (checked against the API — answer
 * to a response returns `in_reply_to_id` = the root). The wires are therefore flat.
 */
export async function replyToPullRequestReviewComment(opts: {
  token: string;
  repoFullName: string;
  number: number;
  commentId: number;
  body: string;
}): Promise<PullRequestReviewComment> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const created = await ghJson<RawReviewComment>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${opts.number}/comments/${opts.commentId}/replies`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: opts.body }),
    },
  );
  return toReviewComment(created);
}

// ── Resolution of review threads (MIN-139) ──────────────────────────────────

/** Same safeguard as comment pagination: 10 × 100 threads. */
const REVIEW_THREADS_MAX_PAGES = 10;

interface RawReviewThreads {
  repository?: {
    pullRequest?: {
      reviewThreads?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        nodes?: Array<{
          id?: string;
          isResolved?: boolean;
          resolvedBy?: { login?: string } | null;
          comments?: {
            nodes?: Array<{ databaseId?: number | null; outdated?: boolean }>;
          };
        } | null>;
      };
    } | null;
  } | null;
}

/**
 * Review thread resolution status — **the only place GitHub says it**.
 *
 * The comments REST API (`listPullRequestReviewComments`) only knows
 * comments: neither the id of the FIL, nor its resolution. Rather than switching
 * all the reading on GraphQL, we add THIS query next to it: it returns, by
 * thread, its node id (only key for mutations) and the REST id of its comment
 * root (`databaseId`) — that is, exactly the key on which
 * `groupReviewThreads` already groups. The two lists therefore match without
 * heuristique.
 *
 * `comments(first:1)` is enough: GitHub serves comments from a thread of the most
 * old to newest, and the first IS the root (the one whose REST says
 * `in_reply_to_id: null`).
 */
export async function listPullRequestReviewThreads(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<ReviewThreadState[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const query = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
    repository(owner:$owner,name:$name){
      pullRequest(number:$number){
        reviewThreads(first:100,after:$cursor){
          pageInfo{hasNextPage endCursor}
          nodes{id isResolved resolvedBy{login} comments(first:1){nodes{databaseId outdated}}}
        }
      }
    }
  }`;

  const states: ReviewThreadState[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < REVIEW_THREADS_MAX_PAGES; page++) {
    const data: RawReviewThreads = await ghGraphql<RawReviewThreads>(opts.token, query, {
      owner,
      name: repo,
      number: opts.number,
      cursor,
    });
    const threads = data.repository?.pullRequest?.reviewThreads;
    for (const node of threads?.nodes ?? []) {
      const root = node?.comments?.nodes?.[0];
      const rootCommentId = root?.databaseId;
      // A thread without a node id or without a readable root cannot be matched to anything: we
      // drop it rather than invent a key.
      if (!node?.id || rootCommentId == null) continue;
      states.push({
        rootCommentId,
        threadId: node.id,
        resolved: !!node.isResolved,
        resolvedBy: node.resolvedBy?.login ?? null,
        outdated: !!root?.outdated,
      });
    }
    if (!threads?.pageInfo?.hasNextPage || !threads.pageInfo.endCursor) break;
    cursor = threads.pageInfo.endCursor;
  }
  return states;
}

/**
 * Resolves (or reopens) a review thread. GraphQL ONLY: REST does not expose
 * either operation, and the thread is addressed by the node ID returned by
 * `listPullRequestReviewThreads`, never by a comment ID.
 */
export async function setPullRequestReviewThreadResolved(opts: {
  token: string;
  threadId: string;
  resolved: boolean;
}): Promise<void> {
  const mutation = opts.resolved
    ? "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}"
    : "mutation($id:ID!){unresolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}";
  await ghGraphql<unknown>(opts.token, mutation, { id: opts.threadId });
}

// ── Emoji reactions from review comments (MIN-139) ─────────────────────

/** GraphQL enum of reactions → canonical vocabulary (`pr-review-reactions`). */
const GH_REACTION_BY_ENUM: Record<string, ReviewReactionContent> = {
  THUMBS_UP: "+1",
  THUMBS_DOWN: "-1",
  LAUGH: "laugh",
  HOORAY: "hooray",
  CONFUSED: "confused",
  HEART: "heart",
  ROCKET: "rocket",
  EYES: "eyes",
};

/** A GraphQL reaction group, as rendered by BOTH queries (review and
    conversation): the same fragment, therefore the same form. */
type RawReactionGroup = {
  content?: string;
  viewerHasReacted?: boolean;
  reactors?: { totalCount?: number } | null;
} | null;

/** GraphQL groups → canonical reactions of ONE subject. The zero groups are
    discarded (GitHub keeps for a moment that of a withdrawn reaction: return it
    would display an emoji that no one has asked anymore), and `mine` is forced to false
    when the token is not that of the human — cf. `viewerIsActor`. */
function toReactions(
  commentId: number,
  groups: RawReactionGroup[] | null | undefined,
  viewerIsActor: boolean,
): ReviewCommentReaction[] {
  const out: ReviewCommentReaction[] = [];
  for (const group of groups ?? []) {
    const content = group?.content ? GH_REACTION_BY_ENUM[group.content] : undefined;
    const count = group?.reactors?.totalCount ?? 0;
    if (!content || count <= 0) continue;
    out.push({
      commentId,
      content,
      count,
      mine: viewerIsActor && !!group?.viewerHasReacted,
    });
  }
  return out;
}

/** Comments read per thread. An overflowing review thread is extremely rare, and
    overflow only loses reactions—never text, which REST still returns. */
const REACTIONS_COMMENTS_PER_THREAD = 50;

interface RawReactionThreads {
  repository?: {
    pullRequest?: {
      reviewThreads?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        nodes?: Array<{
          comments?: {
            nodes?: Array<{
              databaseId?: number | null;
              reactionGroups?: RawReactionGroup[] | null;
            } | null>;
          } | null;
        } | null>;
      };
    } | null;
  } | null;
}

/**
 * Reactions from ALL review comments, in one GraphQL query.
 *
 * REST knows how to count them (a comment payload carries a `reactions` object)
 * but does not say whether the current identity has already reacted, which is
 * exactly what determines the button state. REST would require one request per
 * comment; `reactionGroups` returns the whole PR at once, including
 * `viewerHasReacted`, where “viewer” literally means the token bearer.
 *
 * Hence `viewerIsActor` (MIN-145): when false, the token belongs to the
 * installation and `viewerHasReacted` describes the bot. We force `mine: false`
 * instead of showing an “I reacted” state that belongs to no user. Counts are
 * the same for everyone.
 *
 * `commentIds` is ignored: the request starts from the PR, not its comments. It
 * exists only because GitLab has no equivalent and must query each note.
 */
export async function listPullRequestReviewCommentReactions(opts: {
  token: string;
  repoFullName: string;
  number: number;
  viewerIsActor: boolean;
}): Promise<ReviewCommentReaction[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const query = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
    repository(owner:$owner,name:$name){
      pullRequest(number:$number){
        reviewThreads(first:100,after:$cursor){
          pageInfo{hasNextPage endCursor}
          nodes{comments(first:${REACTIONS_COMMENTS_PER_THREAD}){nodes{databaseId reactionGroups{content viewerHasReacted reactors{totalCount}}}}}
        }
      }
    }
  }`;

  const reactions: ReviewCommentReaction[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < REVIEW_THREADS_MAX_PAGES; page++) {
    const data: RawReactionThreads = await ghGraphql<RawReactionThreads>(opts.token, query, {
      owner,
      name: repo,
      number: opts.number,
      cursor,
    });
    const threads = data.repository?.pullRequest?.reviewThreads;
    for (const thread of threads?.nodes ?? []) {
      for (const comment of thread?.comments?.nodes ?? []) {
        const commentId = comment?.databaseId;
        if (commentId == null) continue;
        reactions.push(
          ...toReactions(commentId, comment?.reactionGroups, opts.viewerIsActor),
        );
      }
    }
    if (!threads?.pageInfo?.hasNextPage || !threads.pageInfo.endCursor) break;
    cursor = threads.pageInfo.endCursor;
  }
  return reactions;
}

interface RawReaction {
  id?: number;
  content?: string;
  user?: { login?: string } | null;
}

/**
 * The account to which this token BELONGS (`GET /user`) — the GitHub counterpart of
 * `gitlabCurrentUsername` of `mr.ts`. It is only requested as a last resort:
 * the actor's login already travels with the call, and this round trip does not exist
 * only to catch it when it is OUT OF DATE. Returns null if the question fails —
 * a facility token, for example, has no bearer to name.
 */
async function githubCurrentLogin(token: string): Promise<string | null> {
  const me = await ghJson<{ login?: string }>(`${GITHUB_API_BASE}/user`, token).catch(
    () => null,
  );
  return me?.login ?? null;
}

/**
 * Post or remove a reaction to a review comment. REST on both sides
 * of the toggle: the equivalent GraphQL mutation is addressed by node id, that the
 * palette has not yet commented WITHOUT reaction.
 *
 * Human gesture (MIN-145): the token is that of the ACTOR, and `login` his account
 * — the reaction to be removed is searched by this name, because the REST does not know
 * delete “mine” without its id, and that the list only distinguishes them by
 * their author. Without `login`, we raise: falling back on the bot would do exactly the
 * bug that this ticket corrects, and pose a reaction that we will never be able to remove
 * is not better.
 *
 * This name is only a SHORTCUT, never authority: when it does not designate any
 * reaction of the comment, it is the token that we ask for its bearer (cf. the
 * withdrawal below). He is the authority — the stored name may have aged.
 */
export async function setPullRequestReviewCommentReaction(opts: {
  token: string;
  repoFullName: string;
  commentId: number;
  content: ReviewReactionContent;
  on: boolean;
  login: string | null;
}): Promise<void> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  return setGithubReaction({
    ...opts,
    base: `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/comments/${opts.commentId}/reactions`,
  });
}

/**
 * The seesaw itself, except for one COLLECTION of reactions (`base`): the same
 * mechanics serves the review comments, those of the thread, and the body of the PR —
 * only the URL changes from one surface to another.
 */
async function setGithubReaction(opts: {
  token: string;
  base: string;
  content: ReviewReactionContent;
  on: boolean;
  login: string | null;
}): Promise<void> {
  if (!opts.login) throw new Error("Reaction requires the actor's GitHub login");
  const base = opts.base;

  if (opts.on) {
    // Idempotent: GitHub returns 200 (not 201) when the reaction already existed.
    await ghJson<unknown>(base, opts.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: opts.content }),
    });
    return;
  }

  const existing = await ghJson<RawReaction[]>(
    `${base}?content=${encodeURIComponent(opts.content)}&per_page=100`,
    opts.token,
  );
  const reactionOf = (login: string | null) =>
    login
      ? (existing ?? []).find((r) => r.user?.login === login && r.content === opts.content)
      : undefined;

  let mine = reactionOf(opts.login);
  // `login` is a CACHE: it comes from `git_user_identities`, written at
  // account login and never refreshed. Whoever renames their GitHub account keeps
  // a valid token and a correct `viewerHasReacted` — its reaction therefore lights up —
  // but this name no longer designates anyone, and the withdrawal would come out through the
  // `return` below: chip always on, no message, one click without
  // effect to be repeated indefinitely. The token does not expire its bearer: we
  // asks him. Only if there is one candidate left — an empty list has no
  // name to be decided, and this is the common case of “already withdrawn”.
  if (!mine && (existing?.length ?? 0) > 0) {
    const current = await githubCurrentLogin(opts.token);
    if (current && current !== opts.login) mine = reactionOf(current);
  }
  // Nothing to remove: the rocker already has the requested effect, it is not a failure.
  if (mine?.id == null) return;
  await ghJson<unknown>(`${base}/${mine.id}`, opts.token, { method: "DELETE" });
}

// ── Conversation THREAD Reactions (MIN-147) ───────────────────────────────

/**
 * Collection of reactions targeted by a conversation comment id.
 *
 * A PR IS an issue at GitHub: its messages live under
 * `issues/comments/{id}`, and its BODY — the message that opens the thread — under
 * `issues/{n}` itself. `PR_BODY_COMMENT_ID` switches between the two.
 */
function conversationReactionsUrl(opts: {
  repoFullName: string;
  number: number;
  commentId: number;
}): string {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const subject =
    opts.commentId === PR_BODY_COMMENT_ID
      ? `issues/${opts.number}`
      : `issues/comments/${opts.commentId}`;
  return `${GITHUB_API_BASE}/repos/${owner}/${repo}/${subject}/reactions`;
}

interface RawConversationReactions {
  repository?: {
    pullRequest?: {
      reactionGroups?: RawReactionGroup[] | null;
      comments?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        nodes?: Array<{
          databaseId?: number | null;
          reactionGroups?: RawReactionGroup[] | null;
        } | null>;
      } | null;
    } | null;
  } | null;
}

/** Feed comment pages read for reactions — beyond that, only comments
    emoji are missing: the TEXT of the comments comes from the REST, without cap. */
const CONVERSATION_REACTIONS_MAX_PAGES = 5;

/**
 * Reactions from the conversation thread — the body of the PR AND all its comments,
 * in a GraphQL query, exactly like their review counterpart.
 *
 * The body comes out under `PR_BODY_COMMENT_ID`: it's one more message in the thread
 * for those who read, a separate subject for those who write (see `conversationReactionsUrl`).
 *
 * `viewerIsActor` (MIN-145): falsely, `viewerHasReacted` speaks of the BOT and not of
 * the person watching — everything comes out as `mine: false`, the accounts remain accurate.
 */
export async function listPullRequestConversationReactions(opts: {
  token: string;
  repoFullName: string;
  number: number;
  viewerIsActor: boolean;
}): Promise<ReviewCommentReaction[]> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const groups = "reactionGroups{content viewerHasReacted reactors{totalCount}}";
  const query = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
    repository(owner:$owner,name:$name){
      pullRequest(number:$number){
        ${groups}
        comments(first:100,after:$cursor){
          pageInfo{hasNextPage endCursor}
          nodes{databaseId ${groups}}
        }
      }
    }
  }`;

  const reactions: ReviewCommentReaction[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < CONVERSATION_REACTIONS_MAX_PAGES; page++) {
    const data: RawConversationReactions = await ghGraphql<RawConversationReactions>(
      opts.token,
      query,
      { owner, name: repo, number: opts.number, cursor },
    );
    const pr = data.repository?.pullRequest;
    // The body ONLY comes from the first page: it is carried by the RA, not by
    // the pagination of the comments, and rereading it would count its reactions twice.
    if (page === 0) {
      reactions.push(
        ...toReactions(PR_BODY_COMMENT_ID, pr?.reactionGroups, opts.viewerIsActor),
      );
    }
    for (const comment of pr?.comments?.nodes ?? []) {
      const commentId = comment?.databaseId;
      if (commentId == null) continue;
      reactions.push(...toReactions(commentId, comment?.reactionGroups, opts.viewerIsActor));
    }
    const pageInfo = pr?.comments?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
  }
  return reactions;
}

/** Post or remove a reaction on a message in the thread — or on the body of the PR
    (`PR_BODY_COMMENT_ID`). Same mechanics as the review, different collection. */
export async function setPullRequestConversationReaction(opts: {
  token: string;
  repoFullName: string;
  number: number;
  commentId: number;
  content: ReviewReactionContent;
  on: boolean;
  login: string | null;
}): Promise<void> {
  return setGithubReaction({ ...opts, base: conversationReactionsUrl(opts) });
}

/** Add a comment to the PR conversation (author = GitHub App minddy). */
export async function createPullRequestComment(opts: {
  token: string;
  repoFullName: string;
  number: number;
  body: string;
}): Promise<PullRequestComment> {
  const { owner, repo } = splitRepo(opts.repoFullName);
  const created = await ghJson<RawComment>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${opts.number}/comments`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: opts.body }),
    },
  );
  return toComment(created);
}
