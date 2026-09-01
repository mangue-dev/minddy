import "server-only";

import {
  GITLAB_API_BASE,
  GITLAB_HOST,
  gitlabHeaders,
  gitlabNextPage,
} from "@/lib/server/git/gitlab-rest";
import {
  GITLAB_AWARD_NAMES,
  PR_BODY_COMMENT_ID,
  reactionFromGitlabName,
  type ReviewCommentReaction,
  type ReviewReactionContent,
} from "@/lib/pr-review-reactions";
import { fromGitlabSystemNotes, type PrTimelineEvent } from "@/lib/pr-timeline";
import { resolveDiffPosition } from "./mr-position";
import { summarizeGitlabPipelines, type ChecksSummary, type RawPipeline } from "./checks-core";
import { reviewFallbackPrefix } from "./review-copy";
import {
  mapGitlabMergePolicy,
  type GitlabProjectPolicyInput,
  type MergeabilityReason,
  type RepositoryMergePolicy,
} from "@/lib/pr-readiness";
import type {
  PullRequestRef,
  PullRequestFile,
  PullRequestComment,
  PullRequestCommit,
  CommitDiff,
  CommitExtras,
  PullRequestReviewComment,
  PullRequestReviewMessage,
  PullRequestReviewSummary,
  RepoMember,
  ReviewSubmission,
  ReviewThreadState,
  ReviewVerdict,
} from "./pr";

/**
 * GitLab Merge Request Operations for Code Broker (MIN-69) — the mirror of
 * `pr.ts` for GitLab API v4, behind the same surface (neutral types from
 * `pr.ts`, identical signatures, exposed via `forge.ts`). Correspondence:
 * • `number` = the `iid` of the MR (number per project, like a PR number);
 * • the repository is addressed by its full URL-encoded path (`group/project`);
 * • state: `opened`/`locked` → `open`, `merged` → `closed` + `merged: true`
 * (same convention as GitHub: `state` open/closed + boolean `merged`);
 * • conversation = non-system notes; anchored review = discussions
 * carrying a `position` (DiffNote). GitLab does not provide `diff_hunk`
 * → empty string (all renderings already have a hunkless fallback).
 * Token: OAuth access token of the connected account (minted by resolveRepoCloneTarget).
 */

/** GitLab API error with an HTTP status, analogous to `GithubApiError`. */
export class GitlabApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GitlabApiError";
    this.status = status;
  }
}

/** Project path `group/sub/project` to GitLab URL ID (fully encoded, including `/`). */
function projectPath(repoFullName: string): string {
  return encodeURIComponent(repoFullName);
}

/** GitLab error message: `message` can be a string, an object, or an array. */
function errorMessage(data: unknown, status: number): string {
  const raw = (data as { message?: unknown; error?: unknown } | null) ?? {};
  const m = raw.message ?? raw.error;
  if (typeof m === "string") return m;
  if (m != null) return JSON.stringify(m);
  return `GitLab API error (${status})`;
}

async function glJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...gitlabHeaders(token), ...init?.headers },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body (rare): data remains null, default message applies.
  }
  if (!res.ok) throw new GitlabApiError(errorMessage(data, res.status), res.status);
  return data as T;
}

/**
 * Paginated variant (offset via X-Next-Page), bounded by `maxPages`. `stopWhen`
 * (optional) bypasses the remaining pages as soon as the accumulation is sufficient —
 * ex. looking for ONE discussion doesn't have to drain the entire thread.
 */
async function glPaged<T>(
  baseUrl: string,
  token: string,
  maxPages: number,
  stopWhen?: (all: T[]) => boolean,
): Promise<T[]> {
  return (await glPagedBounded<T>(baseUrl, token, maxPages, stopWhen)).items;
}

/**
 * The same pagination, but which SAYS if it stopped at the ceiling (MIN-168).
 * A list cut without saying so is indistinguishable from a complete list, and
 * the caller then concludes with what he saw as if that were all.
 * `stopWhen` does not count as a truncation: here, it is the caller who
 * decided he'd had enough.
 */
async function glPagedBounded<T>(
  baseUrl: string,
  token: string,
  maxPages: number,
  stopWhen?: (all: T[]) => boolean,
): Promise<{ items: T[]; truncated: boolean }> {
  const all: T[] = [];
  let page: number | null = 1;
  let fetched = 0;
  while (page && fetched < maxPages) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    const res = await fetch(`${baseUrl}${sep}per_page=100&page=${page}`, {
      headers: gitlabHeaders(token),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // idem glJson
    }
    if (!res.ok) throw new GitlabApiError(errorMessage(data, res.status), res.status);
    all.push(...((data as T[]) ?? []));
    if (stopWhen?.(all)) return { items: all, truncated: false };
    page = gitlabNextPage(res);
    fetched++;
  }
  // There was one page left to read when the ceiling cut.
  return { items: all, truncated: page != null && fetched >= maxPages };
}

interface RawMr {
  iid: number;
  web_url: string;
  state: string; // opened | closed | locked | merged
  merged_at?: string | null;
  draft?: boolean;
  work_in_progress?: boolean;
  title?: string;
  description?: string | null;
  source_branch?: string;
  target_branch?: string;
  sha?: string | null;
  diff_refs?: { base_sha?: string; start_sha?: string; head_sha?: string } | null;
  author?: { username?: string; avatar_url?: string | null } | null;
  created_at?: string;
  updated_at?: string;
  /** Detailed mergeability status (GitLab 15.6+). */
  detailed_merge_status?: string | null;
  /** L'API historique : can_be_merged | cannot_be_merged | unchecked | checking. */
  merge_status?: string | null;
  merge_when_pipeline_succeeds?: boolean;
}

/**
 * GitLab mergability → the GitHub vocabulary that `PullRequestRef` carries, for
 * that the UI only has one language to read. `undefined` = unknown (GitLab calculates
 * also asynchronously: `unchecked` / `checking` on first reading).
 */
function toMergeable(mr: RawMr): {
  mergeable?: boolean | null;
  mergeableState?: string | null;
  mergeabilityReason?: MergeabilityReason | null;
} {
  const detailed = mr.detailed_merge_status;
  if (!detailed) {
    // Fallback to historical API when the instance is older than 15.6.
    if (mr.merge_status === "can_be_merged") {
      return { mergeable: true, mergeableState: "clean", mergeabilityReason: "clean" };
    }
    if (mr.merge_status === "cannot_be_merged") {
      return { mergeable: false, mergeableState: "dirty", mergeabilityReason: "conflicts" };
    }
    return { mergeable: null, mergeableState: "unknown", mergeabilityReason: "checking" };
  }
  if (detailed === "mergeable") {
    return { mergeable: true, mergeableState: "clean", mergeabilityReason: "clean" };
  }
  switch (detailed) {
    case "conflict":
      return { mergeable: false, mergeableState: "dirty", mergeabilityReason: "conflicts" };
    case "checking":
    case "unchecked":
    case "preparing":
      return { mergeable: null, mergeableState: "unknown", mergeabilityReason: "checking" };
    case "not_approved":
      return { mergeable: false, mergeableState: "blocked", mergeabilityReason: "approval_required" };
    case "broken_status":
    case "ci_must_pass":
    case "ci_still_running":
    case "status_checks_must_pass":
      return { mergeable: false, mergeableState: "blocked", mergeabilityReason: "checks" };
    case "discussions_not_resolved":
      return {
        mergeable: false,
        mergeableState: "blocked",
        mergeabilityReason: "unresolved_conversations",
      };
    case "need_rebase":
      return {
        mergeable: false,
        mergeableState: "blocked",
        mergeabilityReason: "branch_out_of_date",
      };
    case "draft_status":
      return { mergeable: false, mergeableState: "blocked", mergeabilityReason: "draft" };
    case "requested_changes":
      return {
        mergeable: false,
        mergeableState: "blocked",
        mergeabilityReason: "changes_requested",
      };
    default:
      // `not_approved`, `blocked_status`, `ci_must_pass`, `discussions_not_resolved`,
      // `need_rebase`, `draft_status`, and `requested_changes` are all refusals
      // from the repository itself, which the UI presents as “merge blocked”.
      return { mergeable: false, mergeableState: "blocked", mergeabilityReason: "policy" };
  }
}

function toRef(mr: RawMr): PullRequestRef {
  const merged = mr.state === "merged" || !!mr.merged_at;
  return {
    number: mr.iid,
    url: mr.web_url,
    // Neutral convention of `pr.ts`: `state` open/closed + boolean `merged`.
    // `locked` is a transient state (merge in progress) → open.
    state: mr.state === "opened" || mr.state === "locked" ? "open" : "closed",
    draft: mr.draft ?? mr.work_in_progress,
    merged,
    title: mr.title,
    body: mr.description ?? null,
    head: mr.source_branch,
    base: mr.target_branch,
    headSha: mr.sha ?? mr.diff_refs?.head_sha,
    user: mr.author
      ? { login: mr.author.username ?? "", avatar_url: mr.author.avatar_url ?? null }
      : null,
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
    mergedAt: mr.merged_at ?? null,
    // `nodeId` remains empty: it is a GraphQL GitHub key, with no useful equivalent
    // here (the GitLab draft switch is done by the title — see below).
    ...toMergeable(mr),
    mergeFlowActive: !!mr.merge_when_pipeline_succeeds,
  };
}

/** MR open for `head` (run branch), or null. */
export async function findOpenMergeRequest(opts: {
  token: string;
  repoFullName: string;
  head: string;
}): Promise<PullRequestRef | null> {
  const mrs = await glJson<RawMr[]>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests` +
      `?state=opened&source_branch=${encodeURIComponent(opts.head)}`,
    opts.token,
  );
  return mrs.length > 0 ? toRef(mrs[0]) : null;
}

/**
 * Opens the MR of the run, or returns the one already open for this branch (resume).
 * GitLab responds 409 “Another open merge request already exists” in this case.
 *
 * GitHub parity on EMPTY branch: GitLab accepts MR without any commits —
 * Minddy rejects it with 422 (the same status as GitHub's “No commits between…”),
 * GitHub), otherwise the agent would open an empty MR and push the ticket for review.
 */
export async function ensureMergeRequest(opts: {
  token: string;
  repoFullName: string;
  head: string;
  base: string;
  title: string;
  body: string;
}): Promise<PullRequestRef> {
  const compare = await glJson<{ commits?: unknown[] }>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/compare` +
      `?from=${encodeURIComponent(opts.base)}&to=${encodeURIComponent(opts.head)}`,
    opts.token,
  );
  if ((compare.commits ?? []).length === 0) {
    throw new GitlabApiError("No commits between base and head branches", 422);
  }
  try {
    const created = await glJson<RawMr>(
      `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests`,
      opts.token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_branch: opts.head,
          target_branch: opts.base,
          title: opts.title,
          description: opts.body,
        }),
      },
    );
    return toRef(created);
  } catch (err) {
    if (err instanceof GitlabApiError && err.status === 409) {
      const existing = await findOpenMergeRequest({
        token: opts.token,
        repoFullName: opts.repoFullName,
        head: opts.head,
      });
      if (existing) return existing;
    }
    throw err;
  }
}

export async function getMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestRef> {
  const mr = await glJson<RawMr>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`,
    opts.token,
  );
  return toRef(mr);
}

export async function getRepositoryMergePolicy(opts: {
  token: string;
  repoFullName: string;
  number: number;
  base: string;
}): Promise<RepositoryMergePolicy> {
  const project = await glJson<GitlabProjectPolicyInput>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}`,
    opts.token,
  );
  return mapGitlabMergePolicy(project);
}

interface RawDiff {
  old_path?: string;
  new_path?: string;
  diff?: string;
  new_file?: boolean;
  renamed_file?: boolean;
  deleted_file?: boolean;
}

/** Count +/- of a unified diff (GitLab does not provide stats per file).
    Kept IN hunks, same rules as `resolveDiffPosition`: a line of
    content `++…` is indeed an addition, a header excluding hunk is nothing. */
function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line)) {
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\")) continue;
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { additions, deletions };
}

const DIFFS_MAX_PAGES = 10;

/** MR raw diffs (endpoint /diffs, paginated). Shared files + positions.
    `stopWhen` bypasses pagination when looking for only one file. */
async function listRawDiffs(
  opts: {
    token: string;
    repoFullName: string;
    number: number;
  },
  stopWhen?: (all: RawDiff[]) => boolean,
): Promise<RawDiff[]> {
  return glPaged<RawDiff>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/diffs`,
    opts.token,
    DIFFS_MAX_PAGES,
    stopWhen,
  );
}

/** Raw GitLab diff to a neutral file shape (status, +/- counts, unified patch). */
function toPullRequestFile(d: RawDiff): PullRequestFile {
  const { additions, deletions } = countDiffLines(d.diff ?? "");
  return {
    filename: d.new_path ?? d.old_path ?? "",
    status: d.new_file
      ? "added"
      : d.deleted_file
        ? "removed"
        : d.renamed_file
          ? "renamed"
          : "modified",
    additions,
    deletions,
    // Empty diff (binary / too big) → undefined, like `patch` GitHub.
    patch: d.diff || undefined,
    previous_filename: d.renamed_file ? d.old_path : undefined,
  };
}

/** MR files in neutral format (unified diff patches) — in-app review. */
export async function listMergeRequestChanges(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<{ files: PullRequestFile[]; truncated: boolean }> {
  const { items, truncated } = await glPagedBounded<RawDiff>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/diffs`,
    opts.token,
    DIFFS_MAX_PAGES,
  );
  return { files: items.map(toPullRequestFile), truncated };
}

interface RawCommit {
  id: string;
  message?: string;
  title?: string;
  author_name?: string | null;
  author_email?: string | null;
  authored_date?: string | null;
  created_at?: string | null;
  web_url?: string | null;
  parent_ids?: string[] | null;
  /** Served by the detail of ONE commit, never by the list of an MR. */
  stats?: { additions?: number; deletions?: number } | null;
}

/** Same ceiling as `pr.ts`: 3 pages of 100 commits, `truncated` beyond. */
const COMMITS_MAX_PAGES = 3;

/**
 * The MR commits, from oldest to newest — the order of `pr.ts`, and
 * so the one that the Commits tab displays on both sides. GitLab serves this
 * list in reverse (branch head first): we sort it by date, the only
 * key that the two forges give.
 *
 * Neither forge account nor signature here: the API of commits of an MR is only used
 * the name written in the commit, and the check would request a PAR call
 * commit (`/repository/commits/{sha}/signature`). `author: null` +
 * `verified: null` say "we don't know", which the renderer already processes.
 */
export async function listMergeRequestCommits(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<{ commits: PullRequestCommit[]; truncated: boolean }> {
  const raw = await glPaged<RawCommit>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/commits`,
    opts.token,
    COMMITS_MAX_PAGES,
  );
  const commits = raw
    // The forge serves the branch head first: inversion is sufficient in the case
    // current, and the sorting that follows only straightens out the rebases (a
    // author date can precede that of the previous commit).
    .reverse()
    .map((c) => {
      const authoredAt = c.authored_date ?? c.created_at ?? null;
      return {
        sha: c.id,
        // `message` has the title AND the body; `title` alone is the withdrawal of
        // instances that only serve him on this endpoint.
        message: c.message ?? c.title ?? "",
        author: null,
        authorName: c.author_name ?? null,
        authorEmail: c.author_email ?? null,
        authoredAt,
        // Some instances do not serve `web_url` here: the commit URL is
        // stable and rebuilds itself, like that of the compare.
        url: c.web_url ?? `${GITLAB_HOST}/${opts.repoFullName}/-/commit/${c.id}`,
        verified: null,
        // First parent: The main line of a merge commit.
        parentSha: c.parent_ids?.[0] ?? null,
        // As with GitHub, the list contains neither stats nor authors (`…CommitExtras`)
        // — except that GitLab will never be able to resolve the latter into accounts:
        // the caller will read the `Co-authored-by` trailers of the message.
        authors: [],
        additions: null,
        deletions: null,
      } satisfies PullRequestCommit;
    })
    // STABLE sorting, and an unreadable date compares to 0 (`Array.sort` rule on
    // NaN): two commits from the same push often share the second, and
    // the order of the forge is then the only tie-breaker we have.
    .sort((a, b) => Date.parse(a.authoredAt ?? "") - Date.parse(b.authoredAt ?? ""));
  return { commits, truncated: raw.length >= COMMITS_MAX_PAGES * 100 };
}

/**
 * Beyond that, we're not going to look for stats: GitLab doesn't have the equivalent of
 * GraphQL from GitHub (no endpoint serves the weight of MULTIPLE commits from one
 * blow), so each commit costs a round trip. Fifty is enough for MRs
 * that we really read commit by commit; beyond this, the +/− indicator disappears and
 * a commit's diff remains open — it carries its own numbers.
 */
const MAX_STATS_COMMITS = 50;
/** In-flight stat queries: enough for 50 commits to fit in ~10 turns. */
const STATS_CONCURRENCY = 5;

/**
 * The weight of each MR commit, indexed by SHA — the GraphQL counterpart of
 * `pr.ts`, much less elegant: GitLab only serves `stats` on the DETAIL
 * of a commit, therefore one call per commit, in bounded parallel.
 *
 * Best-effort commit by commit: an unreadable SHA (commit pruned by one
 * force-push) does not take away its numbers from others.
 */
export async function listMergeRequestCommitExtras(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<Map<string, CommitExtras>> {
  const { commits } = await listMergeRequestCommits(opts);
  const shas = commits.slice(0, MAX_STATS_COMMITS).map((c) => c.sha);
  const stats = new Map<string, CommitExtras>();

  for (let i = 0; i < shas.length; i += STATS_CONCURRENCY) {
    const slice = shas.slice(i, i + STATS_CONCURRENCY);
    await Promise.all(
      slice.map(async (sha) => {
        try {
          const commit = await glJson<RawCommit>(
            `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/commits/${sha}`,
            opts.token,
          );
          stats.set(sha, {
            additions: commit.stats?.additions ?? 0,
            deletions: commit.stats?.deletions ?? 0,
            // GitLab does NOT resolve any counts on its commits, including co-authors:
            // the caller will read the message trailers, the only source remaining.
            authors: [],
          });
        } catch (err) {
          console.error("[mr] commit stats unreadable:", (err as Error).message);
        }
      }),
    );
  }
  return stats;
}

/**
 * The diff of ONE commit against its parent, in neutral format. Two calls:
 * diffs on one side (paginated), the commit on the other — it is he who carries the
 * stats, web URL and parent, which neither endpoint serves together.
 */
export async function getCommitDiff(opts: {
  token: string;
  repoFullName: string;
  sha: string;
}): Promise<CommitDiff> {
  const base = `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/commits/${opts.sha}`;
  const [diffs, commit] = await Promise.all([
    glPaged<RawDiff>(`${base}/diff`, opts.token, DIFFS_MAX_PAGES),
    glJson<RawCommit>(base, opts.token),
  ]);
  const files = diffs.map(toPullRequestFile);
  return {
    files,
    // `stats` missing (old instance): the patches already carry them, we
    // recount rather than announcing zero.
    additions:
      commit.stats?.additions ?? files.reduce((n, f) => n + f.additions, 0),
    deletions:
      commit.stats?.deletions ?? files.reduce((n, f) => n + f.deletions, 0),
    url: commit.web_url ?? `${GITLAB_HOST}/${opts.repoFullName}/-/commit/${opts.sha}`,
    parentSha: commit.parent_ids?.[0] ?? null,
  };
}

/**
 * CUMULATIVE Diff of a branch of work against its base — the mirror of the comparison
 * GitHub (`pr.ts`), for the diff view of a session WITHOUT MR. `from...to` differs
 * from the merge base (API default `straight=false`), like an MR.
 * The web URL is constructed by hand: the compare API does not return it.
 * Raises GitlabApiError(404) if the branch has not (yet) been pushed.
 */
export async function compareBranches(opts: {
  token: string;
  repoFullName: string;
  base: string;
  head: string;
}): Promise<{ files: PullRequestFile[]; url: string | null }> {
  const compare = await glJson<{ diffs?: RawDiff[] }>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/compare` +
      `?from=${encodeURIComponent(opts.base)}&to=${encodeURIComponent(opts.head)}`,
    opts.token,
  );
  return {
    files: (compare.diffs ?? []).map(toPullRequestFile),
    url:
      `${GITLAB_HOST}/${opts.repoFullName}/-/compare/` +
      `${encodeURIComponent(opts.base)}...${encodeURIComponent(opts.head)}`,
  };
}

/**
 * Merge base of two branches, the MR-less counterpart to `getMergeBaseSha`. It
 * supplies base context when expanding a diff for a session that has no MR yet.
 * GitLab exposes it directly through the `repository/merge_base` endpoint.
 */
export async function getBranchesMergeBaseSha(opts: {
  token: string;
  repoFullName: string;
  base: string;
  head: string;
}): Promise<string> {
  const res = await glJson<{ id?: string }>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/merge_base` +
      `?refs[]=${encodeURIComponent(opts.base)}&refs[]=${encodeURIComponent(opts.head)}`,
    opts.token,
  );
  if (!res.id) throw new GitlabApiError("No merge base for these branches", 502);
  return res.id;
}

/** Same ceiling as `pr.ts`: 5 pages of 100 are enough for a branch picker. */
const MAX_BRANCH_PAGES = 5;

/**
 * Repository branch names (agent launch base branch picker) —
 * mirror of `pr.ts`. The sorting (default first) is done by the caller.
 */
export async function listBranches(opts: {
  token: string;
  repoFullName: string;
}): Promise<string[]> {
  const branches = await glPaged<{ name: string }>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/branches`,
    opts.token,
    MAX_BRANCH_PAGES,
  );
  return branches.map((b) => b.name);
}

/** Same ceiling as `pr.ts` (MAX_MEMBER_PAGES). */
const MAX_MEMBER_PAGES = 2;

/**
 * GitLab accounts that can be mentioned on this project (MIN-162).
 *
 * Use `members/all`, not `members`: GitLab distinguishes direct project members
 * from those inheriting access through a parent group. On group-based instances,
 * inherited members are often the majority. This matches GitHub's
 * `affiliation=all` behavior.
 *
 * GitLab returns `name` in addition to `username`. Keep it so suggestions can
 * search both names and identifiers, while always inserting `@username`, the
 * only form that sends a notification.
 */
export async function listRepoMembers(opts: {
  token: string;
  repoFullName: string;
}): Promise<RepoMember[]> {
  const rows = await glPaged<{ username?: string; name?: string; avatar_url?: string | null }>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/members/all`,
    opts.token,
    MAX_MEMBER_PAGES,
  );
  return rows
    .filter((r): r is { username: string; name?: string; avatar_url?: string | null } =>
      !!r.username,
    )
    .map((r) => ({
      login: r.username,
      avatar_url: r.avatar_url ?? null,
      name: r.name ?? null,
    }));
}

/** Same ceiling as `pr.ts` (MAX_PR_PAGES) for cleaning branches. */
const MAX_MR_PAGES = 5;

/**
 * ALL MRs in the repository, all states combined (MIN-102) — mirror of `pr.ts`.
 * `state=all` is doubly necessary here: GitLab counts `merged` and `closed`
 * as two DISTINCT states (`state=closed` does NOT bring back the merged ones), and
 * In any case, we want to see the MRs open to protect their branches.
 */
export async function listPullRequests(opts: {
  token: string;
  repoFullName: string;
}): Promise<{ pulls: PullRequestRef[]; truncated: boolean }> {
  const raw = await glPaged<RawMr>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests` +
      `?state=all&order_by=updated_at&sort=desc`,
    opts.token,
    MAX_MR_PAGES,
  );
  return {
    pulls: raw.map(toRef),
    // glPaged stops on `maxPages` without saying it: a harvest full to the brim
    // edge is the only clue that there were any pages left.
    truncated: raw.length >= MAX_MR_PAGES * 100,
  };
}

/**
 * Removes a remote branch (MIN-102) — mirror of `deleteBranch` of `pr.ts`.
 * Unlike GitHub, the branch name is fully URL-encoded here because the GitLab
 * API expects one segment, not a path. A 404 becomes `"already-gone"`.
 */
export async function deleteBranch(opts: {
  token: string;
  repoFullName: string;
  branch: string;
}): Promise<"deleted" | "already-gone"> {
  try {
    await glJson<unknown>(
      `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/branches/` +
        encodeURIComponent(opts.branch),
      opts.token,
      { method: "DELETE" },
    );
    return "deleted";
  } catch (err) {
    if (err instanceof GitlabApiError && err.status === 404) return "already-gone";
    throw err;
  }
}

/**
 * SHA of the BASE of the diff served by GitLab for this MR: `diff_refs.base_sha`.
 *
 * The trap mirror documented in `pr.ts` (getMergeBaseSha), reversed: GitHub
 * recalculates the diff on the fly (the VIVANT base merge is the correct one), GitLab freezes the
 * diff to `diff_refs` — refreshed only when the source branch grows, NOT
 * when the target advances. Recalculating a live base merge would shift the lines
 * unfolded after a rebase/force-push of the target (or after merge). The anchor
 * persisted also survives deletion of the source branch.
 */
export async function getMergeBaseSha(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<string> {
  const mr = await glJson<RawMr>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`,
    opts.token,
  );
  const sha = mr.diff_refs?.base_sha;
  if (!sha) throw new GitlabApiError("Merge request has no diff refs", 502);
  return sha;
}

/** Raw content of a file at a given ref, or null if it does not exist there. */
export async function getFileAtRef(opts: {
  token: string;
  repoFullName: string;
  path: string;
  ref: string;
}): Promise<string | null> {
  const url =
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/files/` +
    `${encodeURIComponent(opts.path)}/raw?ref=${encodeURIComponent(opts.ref)}`;
  const res = await fetch(url, { headers: gitlabHeaders(opts.token, "text/plain") });
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Raw body: default message.
    }
    throw new GitlabApiError(errorMessage(data, res.status), res.status);
  }
  return text;
}

/**
 * Same bytes, undecoded — the GitLab counterpart of `getFileBytesAtRef` of
 * `pr.ts`: `res.text()` interprets the body as UTF-8 and corrupts any binary.
 * Serves side-by-side view of diff images (MIN-66).
 */
export async function getFileBytesAtRef(opts: {
  token: string;
  repoFullName: string;
  path: string;
  ref: string;
}): Promise<ArrayBuffer | null> {
  const url =
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/repository/files/` +
    `${encodeURIComponent(opts.path)}/raw?ref=${encodeURIComponent(opts.ref)}`;
  const res = await fetch(url, { headers: gitlabHeaders(opts.token, "application/octet-stream") });
  if (res.status === 404) return null;
  if (!res.ok) {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      // Raw body: default message.
    }
    throw new GitlabApiError(errorMessage(data, res.status), res.status);
  }
  return res.arrayBuffer();
}

/**
 * Merge the MR. The STRATEGY (merge commit / fast-forward) is an adjustment of the
 * project at GitLab, not a call parameter like at GitHub: the only
 * lever by MR is `squash`. Hence `mergeMethods` reduced to `["merge","squash"]`
 * side `forge.ts` — “merge” here means “the project strategy, without
 * overwriting commits”.
 */
export async function mergeMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
  method?: "merge" | "squash" | "rebase";
  commitTitle?: string;
  commitMessage?: string;
}): Promise<void> {
  const customMessage = [opts.commitTitle?.trim(), opts.commitMessage?.trim()]
    .filter(Boolean)
    .join("\n\n");
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/merge`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        squash: opts.method === "squash",
        ...(customMessage
          ? opts.method === "squash"
            ? { squash_commit_message: customMessage }
            : { merge_commit_message: customMessage }
          : {}),
      }),
    },
  );
}

export async function rebaseMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
  headSha?: string;
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/rebase`,
    opts.token,
    { method: "PUT" },
  );
}

export async function rerunMergeRequestCheck(opts: {
  token: string;
  repoFullName: string;
  number: number;
  ref: { kind: "github_check_suite" | "gitlab_pipeline"; id: number };
}): Promise<void> {
  if (opts.ref.kind !== "gitlab_pipeline") {
    throw new GitlabApiError("Pipeline cannot be retried by GitLab", 409);
  }
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/pipelines/${opts.ref.id}/retry`,
    opts.token,
    { method: "POST" },
  );
}

export async function updateMergeRequestTitle(opts: {
  token: string;
  repoFullName: string;
  number: number;
  title: string;
}): Promise<PullRequestRef> {
  const mr = await glJson<RawMr>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: opts.title }),
    },
  );
  return toRef(mr);
}

export async function enableMergeRequestAutoMerge(opts: {
  token: string;
  repoFullName: string;
  number: number;
  nodeId?: string;
  method?: "merge" | "squash" | "rebase";
  queue: boolean;
  headSha?: string;
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/merge`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auto_merge: true,
        squash: opts.method === "squash",
        ...(opts.headSha ? { sha: opts.headSha } : {}),
      }),
    },
  );
}

/** Title prefixes by which GitLab marks a draft MR (`WIP:` is
    the old form, still accepted by the old authorities). */
const DRAFT_TITLE_PREFIX = /^\s*(?:\[?draft\]?|\[?wip\]?)\s*:?\s*/i;

/**
 * Switches a draft MR to “ready for review”. GitLab has no field
 * nor dedicated action: the draft IS the prefix `Draft:` of the title — we reread
 * therefore the title and we return it without its prefix. The counterpart of the mutation
 * GraphQL de GitHub (`markPullRequestReadyForReview`).
 */
export async function markMergeRequestReadyForReview(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  const path = `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`;
  const mr = await glJson<RawMr>(path, opts.token);
  const title = (mr.title ?? "").replace(DRAFT_TITLE_PREFIX, "").trim();
  if (!title) throw new GitlabApiError("Merge request has no title to restore", 422);
  await glJson<unknown>(path, opts.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

/** Switches an open merge request to draft using GitLab's title convention. */
export async function convertMergeRequestToDraft(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  const path = `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`;
  const mr = await glJson<RawMr>(path, opts.token);
  const title = (mr.title ?? "").replace(DRAFT_TITLE_PREFIX, "").trim();
  if (!title) throw new GitlabApiError("Merge request has no title to preserve", 422);
  await glJson<unknown>(path, opts.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `Draft: ${title}` }),
  });
}

// ── Reviews formelles (MIN-138) ──────────────────────────────────────────────

/** Does GitLab deny approval (MR author, or tier without the API)?
    Unlike GitHub's 422, it's a 401 — and a 403/404 on
    instances where the trust endpoint is not served. */
function isApprovalRefusal(err: unknown): boolean {
  return (
    err instanceof GitlabApiError &&
    (err.status === 401 || err.status === 403 || err.status === 404)
  );
}

export async function approveMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/approve`,
    opts.token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
}

export async function unapproveMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/unapprove`,
    opts.token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
}

/**
 * Submits a review on MR — the counterpart of `submitPullRequestReview`, with
 * two deviations that GitLab imposes:
 * • there is no composite review: the approval and the message are two
 * calls (`/approve` then a note), and the message must not be lost if
 * approval fails;
 * • there is **no** native `REQUEST_CHANGES` → a prefixed verdict note,
 * as the webhook (`app/api/webhooks/gitlab/route.ts`) already documents.
 * As on GitHub, self-approval is refused (project setting
 * `merge_requests_author_approval`, prohibited by default): we then land on
 * the note alone, and it's Minddy who keeps track of the verdict.
 */
export async function submitMergeRequestReview(opts: {
  token: string;
  repoFullName: string;
  number: number;
  verdict: ReviewVerdict;
  body: string;
  locale?: string;
}): Promise<ReviewSubmission> {
  let published: ReviewSubmission["published"] =
    opts.verdict === "request_changes" ? "comment" : "review";

  if (opts.verdict === "approve") {
    try {
      await approveMergeRequest(opts);
    } catch (err) {
      if (!isApprovalRefusal(err)) throw err;
      published = "comment";
    }
  }

  const prefix = published === "comment"
    ? reviewFallbackPrefix(opts.verdict, opts.locale)
    : "";
  const body = `${prefix}\n\n${opts.body}`.trim();
  // A bare approval without a message has nothing more to say: the note does not go away
  // only if it carries something (the prefix counts as content).
  if (body) {
    await createMergeRequestNote({ ...opts, body });
  }
  return { published };
}

interface RawApprovals {
  approved_by?: Array<{ user?: { username?: string } | null }> | null;
  approvals_required?: number | null;
}

/**
 * Summary of MR approvals. GitLab maintains the current approver list rather
 * than a review history like GitHub, so there is nothing to reduce.
 * `changesRequested` is always 0 because that review state does not exist on
 * GitLab; minddy represents requested changes with a note and an event.
 */
export async function listMergeRequestApprovals(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestReviewSummary> {
  const data = await glJson<RawApprovals>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/approvals`,
    opts.token,
  );
  return {
    approvals: (data.approved_by ?? []).length,
    changesRequested: 0,
    requiredApprovals: data.approvals_required ?? null,
  };
}

/**
 * Reviews already submitted, with their text — STILL EMPTY on the GitLab side, and
 * this is the correct answer rather than a mistake: GitLab does not have a “review” object.
 * An approval is a signature without text (`/approvals`, counted
 * above), and everything written on an MR is a NOTE — therefore already used
 * by `listMergeRequestNotes`. Returning the grades here would count them twice.
 */
export async function listMergeRequestReviewMessages(): Promise<PullRequestReviewMessage[]> {
  return [];
}

/**
 * MR CI Checks: its pipelines, from newest to oldest — only the
 * last describes the current state (see `checks-core`). The OAuth scope `api` already
 * acquired is enough: no permission to accept, unlike GitHub.
 */
export async function listMergeRequestChecks(opts: {
  token: string;
  repoFullName: string;
  number: number;
  checksRequired?: boolean | null;
}): Promise<ChecksSummary> {
  const pipelines = await glJson<RawPipeline[]>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/pipelines`,
    opts.token,
  );
  const latest = pipelines?.[0];
  const detailed = latest?.id
    ? await glJson<RawPipeline>(
        `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/pipelines/${latest.id}`,
        opts.token,
      ).catch(() => latest)
    : latest;
  return summarizeGitlabPipelines(detailed ? [detailed] : [], opts.checksRequired ?? null);
}

export async function closeMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state_event: "close" }),
    },
  );
}

/** Reopens a refused MR (MIN-68) — same product rule as GitHub: we repeat
    the last MR of the branch, never a duplicate. */
export async function reopenMergeRequest(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestRef> {
  const mr = await glJson<RawMr>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state_event: "reopen" }),
    },
  );
  return toRef(mr);
}

interface RawNote {
  id: number;
  body?: string;
  system?: boolean;
  type?: string | null; // "DiffNote" for notes anchored to diff
  author?: { username?: string; avatar_url?: string | null } | null;
  created_at: string;
  position?: RawPosition | null;
  original_position?: RawPosition | null;
  /** Thread resolution, carried by each resolvable note (MIN-139). */
  resolved?: boolean;
  resolvable?: boolean;
  resolved_by?: { username?: string } | null;
}

interface RawPosition {
  old_path?: string | null;
  new_path?: string | null;
  old_line?: number | null;
  new_line?: number | null;
}

/** Web anchor of a note (GitLab does not return URLs per note). */
function noteUrl(repoFullName: string, iid: number, noteId: number): string {
  return `${GITLAB_HOST}/${repoFullName}/-/merge_requests/${iid}#note_${noteId}`;
}

function toComment(
  repoFullName: string,
  iid: number,
  n: RawNote,
): PullRequestComment {
  return {
    id: n.id,
    body: n.body ?? "",
    user: n.author
      ? { login: n.author.username ?? "", avatar_url: n.author.avatar_url ?? null }
      : null,
    created_at: n.created_at,
    html_url: noteUrl(repoFullName, iid, n.id),
  };
}

const NOTES_MAX_PAGES = 10;

/**
 * MR Conversation Comments: NON-System and NON-Anchored Notes
 * at diff (DiffNotes live in review discussions, another endpoint).
 */
export async function listMergeRequestNotes(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestComment[]> {
  const notes = await glPaged<RawNote>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/notes` +
      `?sort=asc&order_by=created_at`,
    opts.token,
    NOTES_MAX_PAGES,
  );
  return notes
    .filter((n) => !n.system && n.type !== "DiffNote")
    .map((n) => toComment(opts.repoFullName, opts.number, n));
}

/**
 * MR ACTIVITY (MIN-159): approvals, pushed commits, labels,
 * assignments, title changes, draft ↔ ready, merge, close.
 *
 * GitLab doesn't type ANY of this: it writes it in English in a note marked
 * `system`, on the same endpoint as the comments. So this is the exact
 * half that `listMergeRequestNotes` throws away, reread with the other filter — the
 * recognition of sentences (and the fallback when none sticks) is in
 * `lib/pr-timeline`, shared with GitHub and the client.
 *
 * Yes, these are the same pages as the thread: two calls instead of one. This is the
 * price of an interface where the two forges answer the same question, where
 * GitHub serves two distinct endpoints well. Pages are hot at GitLab,
 * and merging the two methods would require any caller to know this detail.
 */
export async function listMergeRequestTimeline(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PrTimelineEvent[]> {
  const notes = await glPaged<RawNote>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/notes` +
      `?sort=asc&order_by=created_at`,
    opts.token,
    NOTES_MAX_PAGES,
  );
  return fromGitlabSystemNotes(notes, (noteId) =>
    noteUrl(opts.repoFullName, opts.number, noteId),
  );
}

/** Adds a note to the MR's conversation (author = the connected account). */
export async function createMergeRequestNote(opts: {
  token: string;
  repoFullName: string;
  number: number;
  body: string;
}): Promise<PullRequestComment> {
  const created = await glJson<RawNote>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/notes`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: opts.body }),
    },
  );
  return toComment(opts.repoFullName, opts.number, created);
}

interface RawDiscussion {
  id: string;
  notes?: RawNote[];
}

/** Position → (line, side) in the GitHub sense: new_line → RIGHT, otherwise LEFT. */
function lineOf(p: RawPosition | null | undefined): {
  line: number | null;
  side: "LEFT" | "RIGHT";
} {
  if (p?.new_line != null) return { line: p.new_line, side: "RIGHT" };
  return { line: p?.old_line ?? null, side: "LEFT" };
}

function toReviewComment(
  repoFullName: string,
  iid: number,
  n: RawNote,
  rootId: number | null,
): PullRequestReviewComment {
  const { line, side } = lineOf(n.position);
  const original = lineOf(n.original_position ?? n.position);
  return {
    id: n.id,
    body: n.body ?? "",
    path: n.position?.new_path ?? n.position?.old_path ?? "",
    line,
    original_line: original.line,
    side,
    // GitLab anchors a note on ONE line (`old_line`/`new_line`): no range
    // to reread, and the UI does not offer any on this side either (MIN-181).
    start_line: null,
    original_start_line: null,
    start_side: null,
    in_reply_to_id: rootId,
    // No review to attach this comment to: GitLab has no subject
    // review, its diff notes go alone in the thread (MIN-159).
    review_id: null,
    // GitLab does not expose a hunk snippet per note. Every renderer (UI and
    // agent prompt) falls back to the path, line, and body without a hunk.
    diff_hunk: "",
    user: n.author
      ? { login: n.author.username ?? "", avatar_url: n.author.avatar_url ?? null }
      : null,
    created_at: n.created_at,
    html_url: noteUrl(repoFullName, iid, n.id),
  };
}

const DISCUSSIONS_MAX_PAGES = 10;

async function listRawDiscussions(
  opts: {
    token: string;
    repoFullName: string;
    number: number;
  },
  stopWhen?: (all: RawDiscussion[]) => boolean,
): Promise<RawDiscussion[]> {
  return glPaged<RawDiscussion>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/discussions`,
    opts.token,
    DISCUSSIONS_MAX_PAGES,
    stopWhen,
  );
}

/**
 * MR review comments — notes anchored to one line of the diff
 * (DiffNotes), flattened since the discussions: the root of the thread carries
 * `in_reply_to_id: null`, his answers point to the root (flat wires, even
 * model than GitHub).
 */
export async function listMergeRequestDiffComments(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<PullRequestReviewComment[]> {
  const discussions = await listRawDiscussions(opts);
  const all: PullRequestReviewComment[] = [];
  for (const d of discussions) {
    const notes = (d.notes ?? []).filter((n) => !n.system && n.type === "DiffNote");
    if (notes.length === 0) continue;
    const rootId = notes[0].id;
    notes.forEach((n, i) => {
      all.push(toReviewComment(opts.repoFullName, opts.number, n, i === 0 ? null : rootId));
    });
  }
  return all;
}

/**
 * Review thread resolution status (MIN-139) — the GitLab counterpart to the
 * GraphQL query in `pr.ts`, but with no additional endpoint: discussions
 * already carry everything, while `listMergeRequestDiffComments` discards this
 * data when flattening. `threadId` is the discussion ID (a string, unlike note
 * IDs), and `rootCommentId` is the first DiffNote—the same root as on GitHub,
 * and therefore the same pairing key.
 *
 * This deliberately makes a second paginated pass over `/discussions`, launched
 * in parallel with the first by `prReviewCommentsResponse`, so the same pages
 * are fetched twice. Combining them would require changing the `Forge` shape to
 * return comments and threads together, which does not map cleanly to GitHub's
 * REST and GraphQL reads. The duplication is bounded by
 * `DISCUSSIONS_MAX_PAGES`.
 *
 * `resolved` is carried by every note in the thread because GitLab resolves the
 * thread, not an individual note, so reading the root is enough. An unresolvable
 * discussion (rare for a DiffNote) is reported as `resolved: false`; the caller
 * needs no special case, and the forge rejects an unsupported toggle.
 */
export async function listMergeRequestDiffThreads(opts: {
  token: string;
  repoFullName: string;
  number: number;
}): Promise<ReviewThreadState[]> {
  const discussions = await listRawDiscussions(opts);
  const states: ReviewThreadState[] = [];
  for (const d of discussions) {
    const root = (d.notes ?? []).find((n) => !n.system && n.type === "DiffNote");
    if (!root) continue;
    states.push({
      rootCommentId: root.id,
      threadId: d.id,
      resolved: !!root.resolved,
      resolvedBy: root.resolved_by?.username ?? null,
      outdated: lineOf(root.position).line == null && lineOf(root.original_position).line != null,
    });
  }
  return states;
}

/**
 * Resolves (or reopens) a review thread. Native REST here, where GitHub requires
 * GraphQL: discussion is the object, and `resolved` one of its fields.
 */
export async function setMergeRequestDiscussionResolved(opts: {
  token: string;
  repoFullName: string;
  number: number;
  threadId: string;
  resolved: boolean;
}): Promise<void> {
  await glJson<unknown>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}` +
      `/discussions/${encodeURIComponent(opts.threadId)}`,
    opts.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: opts.resolved }),
    },
  );
}

// ── Emoji reactions from review comments (MIN-139) ─────────────────────

interface RawAward {
  id: number;
  name?: string;
  user?: { username?: string } | null;
}

/** Notes queried at most, and how many at a time: GitLab has no call
    grouped for the awards, so it's an N+1 — limited, never unlimited. */
const AWARDS_MAX_NOTES = 120;
const AWARDS_CONCURRENCY = 8;

/** Run `Promise.all` in batches so a hundred notes never start at once. */
async function mapLimited<A, B>(
  items: A[],
  limit: number,
  fn: (item: A) => Promise<B>,
): Promise<B[]> {
  const out: B[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

/** Connected account login — GitLab awards the awards UNDER ITS NAME, and it is
    the only way to know which ones are ours (no `viewerHasReacted`
    ici, contrairement au GraphQL de GitHub). */
async function gitlabCurrentUsername(token: string): Promise<string | null> {
  const me = await glJson<{ username?: string }>(`${GITLAB_API_BASE}/user`, token);
  return me?.username ?? null;
}

/**
 * Collection of awards for a subject: a note, or the merge request itself—
 * `PR_BODY_COMMENT_ID` (MIN-147), the body that opens the conversation thread.
 *
 * Nothing else distinguishes these surfaces on GitLab: conversation and review
 * notes expose awards under the same URL, so `listMergeRequestNoteAwards` and
 * `setMergeRequestNoteAward` serve both.
 */
function awardsUrl(repoFullName: string, iid: number, noteId: number): string {
  const base = `${GITLAB_API_BASE}/projects/${projectPath(repoFullName)}/merge_requests/${iid}`;
  return noteId === PR_BODY_COMMENT_ID
    ? `${base}/award_emoji`
    : `${base}/notes/${noteId}/award_emoji`;
}

/**
 * Reactions from review comments—the GitLab counterpart to the
 * `reactionGroups` request in `pr.ts`, but queried note by note. The awards API
 * exists only for individual notes, and discussion responses contain no awards.
 * This is therefore the N+1 request pattern anticipated during issue planning,
 * bounded by `AWARDS_MAX_NOTES` and limited concurrency.
 *
 * A note that cannot be read simply returns no reactions; one unreadable
 * reaction must not remove the whole review view.
 *
 * With `viewerIsActor: false` (MIN-145), the token belongs to the project link,
 * not the person viewing the page, so “mine” would be meaningless. We skip
 * `GET /user` and return `mine: false` for every reaction.
 */
export async function listMergeRequestNoteAwards(opts: {
  token: string;
  repoFullName: string;
  number: number;
  commentIds: number[];
  viewerIsActor: boolean;
}): Promise<ReviewCommentReaction[]> {
  const ids = opts.commentIds.slice(0, AWARDS_MAX_NOTES);
  if (ids.length === 0) return [];
  if (opts.commentIds.length > ids.length) {
    console.warn(
      `[mr] awards read capped at ${AWARDS_MAX_NOTES} notes (${opts.commentIds.length} asked)`,
    );
  }
  const me = opts.viewerIsActor
    ? await gitlabCurrentUsername(opts.token).catch(() => null)
    : null;

  const perNote = await mapLimited(ids, AWARDS_CONCURRENCY, async (noteId) => {
    const awards = await glJson<RawAward[]>(
      awardsUrl(opts.repoFullName, opts.number, noteId),
      opts.token,
    ).catch(() => [] as RawAward[]);

    // Aggregated by emoji: the API renders one line PER person, the UI one count.
    const byContent = new Map<ReviewReactionContent, ReviewCommentReaction>();
    for (const award of awards ?? []) {
      const content = award.name ? reactionFromGitlabName(award.name) : null;
      if (!content) continue;
      const entry = byContent.get(content) ?? { commentId: noteId, content, count: 0, mine: false };
      entry.count += 1;
      if (me && award.user?.username === me) entry.mine = true;
      byContent.set(content, entry);
    }
    return [...byContent.values()];
  });

  return perNote.flat();
}

/**
 * Add or remove a reaction from a note. GitLab rejects duplicate awards
 * (“has already been taken”) and only lets users remove their own, so both
 * paths inspect the list, as on GitHub.
 *
 * `login` identifies the actor (MIN-145) and is ignored here: GitLab creates the
 * award under the token account, and `GET /user` supplies the name. It remains
 * in the shared signature because GitHub needs it to find the reaction to
 * delete, just as `commentIds` remains for GitLab while GitHub ignores it.
 */
export async function setMergeRequestNoteAward(opts: {
  token: string;
  repoFullName: string;
  number: number;
  commentId: number;
  content: ReviewReactionContent;
  on: boolean;
  login: string | null;
}): Promise<void> {
  const url = awardsUrl(opts.repoFullName, opts.number, opts.commentId);
  const name = GITLAB_AWARD_NAMES[opts.content];
  const me = await gitlabCurrentUsername(opts.token);
  const awards = await glJson<RawAward[]>(url, opts.token);
  const mine = (awards ?? []).find((a) => a.name === name && a.user?.username === me);

  if (opts.on) {
    // Already awarded: do not repost it, GitLab will respond with an error where
    // the requested state has already been reached.
    if (mine) return;
    await glJson<unknown>(url, opts.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return;
  }
  if (!mine) return;
  await glJson<unknown>(`${url}/${mine.id}`, opts.token, { method: "DELETE" });
}

/**
 * Post a review comment on a line (new GitLab discussion),
 * anchored by the `diff_refs` (base/start/head) read HOT on the MR. Offline
 * diff → GitlabApiError(422), same contract as GitHub (“lineNotInDiff” side
 * road). The file is addressed by its CURRENT path (new_path) same side
 * LEFT — the GitHub convention that the entire UI follows — with fallback to old_path.
 */
export async function createMergeRequestDiffComment(opts: {
  token: string;
  repoFullName: string;
  number: number;
  body: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
}): Promise<PullRequestReviewComment> {
  const matchesPath = (d: RawDiff): boolean =>
    d.new_path === opts.path || d.old_path === opts.path;
  // MR (diff_refs) and diffs are independent — parallel, and paging
  // diffs stops as soon as the target file is found.
  const [mrRaw, diffs] = await Promise.all([
    glJson<RawMr>(
      `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}`,
      opts.token,
    ),
    listRawDiffs(opts, (all) => all.some(matchesPath)),
  ]);
  const refs = mrRaw.diff_refs;
  if (!refs?.base_sha || !refs.head_sha) {
    throw new GitlabApiError("Merge request has no diff refs", 502);
  }

  const file = diffs.find((d) => d.new_path === opts.path) ?? diffs.find(matchesPath);
  const position = file?.diff ? resolveDiffPosition(file.diff, opts.line, opts.side) : null;
  if (!position) {
    throw new GitlabApiError("The line is not part of the merge request diff", 422);
  }

  const created = await glJson<RawDiscussion>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}/discussions`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: opts.body,
        position: {
          position_type: "text",
          base_sha: refs.base_sha,
          start_sha: refs.start_sha ?? refs.base_sha,
          head_sha: refs.head_sha,
          old_path: file?.old_path ?? opts.path,
          new_path: file?.new_path ?? opts.path,
          ...(position.oldLine != null ? { old_line: position.oldLine } : {}),
          ...(position.newLine != null ? { new_line: position.newLine } : {}),
        },
      }),
    },
  );
  const note = (created.notes ?? [])[0];
  if (!note) throw new GitlabApiError("GitLab returned no note for the discussion", 502);
  return toReviewComment(opts.repoFullName, opts.number, note, null);
}

/**
 * Reply in a review thread. `commentId` identifies a thread note, while GitLab
 * addresses replies by discussion. We find the owning discussion and add the
 * note; the flat thread points the reply back to the root.
 */
export async function replyToMergeRequestDiffComment(opts: {
  token: string;
  repoFullName: string;
  number: number;
  commentId: number;
  body: string;
}): Promise<PullRequestReviewComment> {
  const holdsComment = (d: RawDiscussion): boolean =>
    (d.notes ?? []).some((n) => n.id === opts.commentId);
  // Paging stops as soon as the supporting discussion is found.
  const discussions = await listRawDiscussions(opts, (all) => all.some(holdsComment));
  const discussion = discussions.find(holdsComment);
  if (!discussion) {
    throw new GitlabApiError("Review thread not found for this comment", 404);
  }
  const rootId = (discussion.notes ?? []).find((n) => n.type === "DiffNote")?.id ?? opts.commentId;
  const created = await glJson<RawNote>(
    `${GITLAB_API_BASE}/projects/${projectPath(opts.repoFullName)}/merge_requests/${opts.number}` +
      `/discussions/${encodeURIComponent(discussion.id)}/notes`,
    opts.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: opts.body }),
    },
  );
  return toReviewComment(opts.repoFullName, opts.number, created, rootId);
}
