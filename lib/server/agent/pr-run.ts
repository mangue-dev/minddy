import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isRepoProviderId, type RepoProviderId } from "@/lib/repo-providers";
import { issueIdentifier } from "@/lib/issue-constants";
import { displayName } from "@/lib/display-name";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import type { Forge } from "./forge";
import { toPrLineThreads, type PrReviewIssueContext, type PrReviewNote } from "./prompt";
import type { PullRequestState } from "./pull-requests";

/**
 * The PULL REQUEST anchor of an agent run (MIN-168), resolved ONE time and served
 * as is to whatever needs it.
 *
 * Without this module, everyone redid their own resolution: the launch read
 * `pull_requests` to choose a project, execution reread it to find
 * the branches, the tools would reread it for the number, the prompt for the title.
 * Four readings, four opportunities to diverge — and a PR whose head moved
 * entre deux d'entre elles ferait commenter un diff que l'agent n'a pas lu.
 *
 * What the run needs to know about its PR comes down to one thing: where
 * forge, in which warehouse, under what number, between which branches, at which sha, and
 * for which ticket if applicable.
 */

export interface PrRunContext {
  /** Line `pull_requests` — the entity, not the number (see MIN-143). */
  id: string;
  provider: RepoProviderId;
  repoFullName: string;
  number: number;
  title: string | null;
  url: string | null;
  state: PullRequestState;
  /** RELEASE branch. Absent = the entire PR was never synchronized. */
  headBranch: string | null;
  baseBranch: string | null;
  /** Head at the time of reading — the sha that the session will have reread. */
  headSha: string | null;
  /** Ticket that the PR implements, when it carries one (MIN-143). */
  issueId: string | null;
}

const PR_RUN_COLUMNS =
  "id, provider, repo_full_name, number, title, url, state, head_branch, base_branch, head_sha, issue_id";

interface PrRunRow {
  id: string;
  provider: string;
  repo_full_name: string;
  number: number;
  title: string | null;
  url: string | null;
  state: string;
  head_branch: string | null;
  base_branch: string | null;
  head_sha: string | null;
  issue_id: string | null;
}

function toContext(row: PrRunRow): PrRunContext {
  return {
    id: row.id,
    // Same fallback as `rowProvider`: an unknown provider in the database reads GitHub
    // rather than crashing the session.
    provider: isRepoProviderId(row.provider) ? row.provider : "github",
    repoFullName: row.repo_full_name,
    number: row.number,
    title: row.title,
    url: row.url,
    state: (row.state as PullRequestState) ?? "open",
    headBranch: row.head_branch,
    baseBranch: row.base_branch,
    headSha: row.head_sha,
    issueId: row.issue_id,
  };
}

/** The PR of a review run, or null if it no longer exists. Customer service. */
export async function loadPrRunContext(pullRequestId: string): Promise<PrRunContext | null> {
  const { data } = await getServiceClient()
    .from("pull_requests")
    .select(PR_RUN_COLUMNS)
    .eq("id", pullRequestId)
    .maybeSingle();
  return data ? toContext(data as PrRunRow) : null;
}

/**
 * The SERVER reference that carries the head of a pull request — the one that works
 * even when the branch lives in a FORK.
 *
 * `head_branch` alone is not enough: on a fork PR, this branch does not exist
 * not in the base repository, and a `git fetch` on it finds nothing. Both
 * forges publish for this a virtual ref on the base deposit, which points to the
 * lead commit regardless of where it comes from — `refs/pull/<n>/head`
 * at GitHub, `refs/merge-requests/<iid>/head` at GitLab. It's her that we
 * is looking, and that's what makes a fork review possible.
 */
export function pullRequestHeadRef(provider: RepoProviderId, number: number): string {
  return provider === "gitlab"
    ? `refs/merge-requests/${number}/head`
    : `refs/pull/${number}/head`;
}

// ── What the repository does not contain ───────────────────── ─────────────────────

/** Last comments on the ticket uploaded — beyond that, the primer would not keep any
 * anyway than the most recent ones. */
const ISSUE_COMMENTS_LIMIT = 40;

/** Minimum line type of `comments`. */
type IssueCommentRow = { body: unknown; author_id: unknown; via_assistant: unknown };

/**
 * The ticket that PR implements — the context that distinguishes “this code is
 * correct” of “this code does what we asked of it”. Best effort: a PR without
 * ticket (the normal case of a human PR, MIN-143) can be read very well without it.
 *
 * The PLAN and the COMMENTS come together, and this is deliberate: the plan says
 * what had been decided, the comments say what we deviated from and
 * Why. The plan alone would cause assumed deviations to be reported as faults and
 * argued — that is to say the opposite of useful rereading.
 */
export async function loadPrIssueContext(
  issueId: string | null,
): Promise<PrReviewIssueContext | null> {
  if (!issueId) return null;
  try {
    const service = getServiceClient();
    const [{ data }, { data: commentRows }] = await Promise.all([
      service
        .from("issues")
        .select("number, title, description, plan, projects(key)")
        .eq("id", issueId)
        .is("deleted_at", null)
        .maybeSingle(),
      // The MOST RECENT first on the SQL side, then put back in reading order:
      // an ascending `limit` would keep the beginning of a discussion, never its end.
      service
        .from("comments")
        .select("body, author_id, via_assistant")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: false })
        .limit(ISSUE_COMMENTS_LIMIT),
    ]);
    if (!data) return null;
    const key = ((data.projects as { key?: string } | null)?.key ?? "").toString();
    return {
      identifier: issueIdentifier(key, data.number as number),
      title: (data.title as string) ?? "",
      description: (data.description as string | null) ?? null,
      plan: (data.plan as string | null) ?? null,
      comments: await issueNotes(service, commentRows ?? []),
    };
  } catch (err) {
    console.error("[pr-run] issue context failed:", (err as Error).message);
    return null;
  }
}

/**
 * The ticket comments, named. A comment from Numo is signed “Numo”
 * (its `author_id` is that of the person who triggered it — displaying it would
 * tell a human what the assistant wrote); the others go through
 * common name resolution, never by raw email.
 */
async function issueNotes(
  service: ReturnType<typeof getServiceClient>,
  rows: IssueCommentRow[],
): Promise<PrReviewNote[]> {
  const ordered = [...rows].reverse();
  const users = await fetchAuthUsersById(
    service,
    ordered.map((r) => r.author_id as string).filter(Boolean),
  );
  return ordered.map((row) => ({
    author: row.via_assistant
      ? "Numo"
      : displayName(toNamed(users.get(row.author_id as string)), "User"),
    body: (row.body as string | null) ?? "",
  }));
}

/** Journalized fallback from a context reading: what is missing is missing, the session takes place. */
function unreadable<T>(what: string, fallback: T): (err: unknown) => T {
  return (err) => {
    console.error(`[pr-run] ${what} unreadable:`, (err as Error).message);
    return fallback;
  };
}

/** Everything that the start of a proofreading session draws from beyond the submission. */
export interface PrReviewBoot {
  issue: PrReviewIssueContext | null;
  files: Awaited<ReturnType<Forge["listPullRequestFiles"]>>["files"];
  filesTruncated: boolean;
  comments: PrReviewNote[];
  reviews: PrReviewNote[];
  lineThreads: ReturnType<typeof toPrLineThreads>;
  checks: Awaited<ReturnType<Forge["listChecks"]>> | null;
  /** Body of the PR, reread at the forge (the `pull_requests` line does not carry it). */
  body: string | null;
  /** Real head at the time of priming — the sha actually reread. */
  headSha: string | null;
}

/**
 * Loads, in parallel, what the replay session CANNOT read into the
 * sandbox: the ticket, the discussion already held on the PR, the CI, and the list of
 * files (the summary of the diff). The diff itself is not loaded — the agent
 * reads in the repository, in full and up to date.
 *
 * Each reading is BEST-EFFORT, list by list: missing permission on
 * one (the reviews submitted do not have the same custody as the comments according to
 * installations) deprives the primer of that one, not of the others, and does not prevent
 * a proofread that someone pays for.
 */
export async function loadPrReviewBoot(input: {
  forge: Forge;
  call: { token: string; repoFullName: string; number: number };
  pr: PrRunContext;
}): Promise<PrReviewBoot> {
  const { forge, call, pr } = input;

  const [ref, diff, comments, reviews, reviewComments, reviewThreads] = await Promise.all([
    forge.getPullRequest(call).catch(unreadable("pull request", null)),
    forge
      .listPullRequestFiles(call)
      .catch(unreadable("files", { files: [], truncated: false })),
    forge.listPullRequestComments(call).catch(unreadable("comments", [])),
    forge.listReviewMessages(call).catch(unreadable("submitted reviews", [])),
    forge.listPullRequestReviewComments(call).catch(unreadable("review comments", [])),
    forge.listReviewThreads(call).catch(unreadable("review threads", [])),
  ]);

  // The head seen by the forge is authentic on the line `pull_requests`, which can
  // dater du dernier webhook.
  const headSha = ref?.headSha ?? pr.headSha ?? null;
  const checks = headSha
    ? await forge
        .listChecks({ ...call, sha: headSha })
        .catch(unreadable("checks", null))
    : null;

  const issue = await loadPrIssueContext(pr.issueId);

  return {
    issue,
    files: diff.files,
    filesTruncated: diff.truncated,
    comments: comments.map((c) => ({ author: c.user?.login ?? "someone", body: c.body })),
    reviews: reviews.map((r) => ({
      author: r.author ?? "someone",
      about: r.state.replace(/_/g, " "),
      body: r.body,
    })),
    lineThreads: toPrLineThreads(reviewComments, reviewThreads),
    checks,
    body: ref?.body ?? null,
    headSha,
  };
}
