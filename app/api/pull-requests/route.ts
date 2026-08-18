import { after, NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthedUser } from "@/lib/server/api-auth";
import { type RepoProviderId } from "@/lib/repo-providers";
import { resolveRepoCloneTargetForRepo } from "@/lib/server/agent/repo-access";
import { getRun } from "@/lib/server/agent/runs";
import {
  findPullRequest,
  listPullRequestsForUser,
  listVisibleRepos,
  needsRepoSync,
  readRepoSyncStates,
  repoSyncKey,
  resolvePrForRun,
  rowProvider,
  stampRepoSync,
  syncRepoPullRequests,
  type PullRequestState,
  type PullRequestWithIssue,
  type VisibleRepo,
} from "@/lib/server/agent/pull-requests";

/**
 * GLOBAL list of pull requests from linked repositories, all projects accessible
 * combined (MIN-66, expanded by MIN-143).
 *
 * It started from `agent_runs` and therefore only showed Numo's PRs — half
 * of the deposit, without saying it. It now starts from `pull_requests`, where a PR is
 * a line: those of Numo are there, those of humans too. The run is no more
 * the wearer, he is a DECORATION (“Numo reworks”, “relaunch Numo”),
 * attached when one exists.
 *
 * Access: RLS of `project_git_links` (the client cookie is enough) to know
 * which repositories are visible, then RLS of `pull_requests` for the rows.
 */

export const runtime = "nodejs";
// A BLOCKING catch-up (deposit never scanned) makes a paginated round trip at
// the forge before responding: the default window of a route is not enough.
export const maxDuration = 120;

/** How many PRs at most per answer. An active repository has hundreds. */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// “Numo rework” = the agent WORKS (queued/running). A REST run is not
// NOT reworking the PR — otherwise the PR would remain “in progress” for
// always and merge/reject actions would be blocked indefinitely.
const WORKING_STATUSES = ["queued", "running"];

interface RunRow {
  id: string;
  status: string;
  pr_number: number | null;
  created_at: string;
  repo_link: { provider: string; repo_full_name: string | null } | null;
}

export interface PullRequestListItem {
  /** Item identity — the PR, plus the run that opened it (MIN-143). */
  prId: string;
  pr_number: number;
  pr_url: string | null;
  pr_state: PullRequestState;
  /** Repository Provider — controls PR/MR vocabulary and links (MIN-69). */
  provider: RepoProviderId;
  title: string | null;
  /** Who opened the PR — what distinguishes a Numo PR from a human PR. */
  author: { login: string; avatar_url: string | null } | null;
  head_branch: string | null;
  created_at: string;
  updated_at: string;
  issue: { id: string; number: number; title: string } | null;
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    orb_seed: string | null;
  } | null;
  /**
   * CANONICAL run of the PR (oldest), or null: a human PR has none
   * none. It is he who carries the historical `?run=` deep-links.
   */
  runId: string | null;
  /** A run that WORKS (queued/running) on ​​this PR = “Numo is working again”. */
  activeRunId: string | null;
  /** An ACTIVE run occupies the issue → no new change request (MIN-68). */
  busyRunId: string | null;
  /** ALL runs that carry this PR — a deep-link `?run=` matches any one. */
  runIds: string[];
}

/** States served by the filter. `open` includes drafts (they are). */
const STATE_FILTERS: Record<string, PullRequestState[]> = {
  open: ["open", "draft"],
  merged: ["merged"],
  closed: ["closed"],
};

/**
 * Catching up on a deposit. BLOCKING if it has never been scanned — otherwise the page
 * would appear empty on a repository that has just been linked. Simply OUT OF DATE, it
 * part in `after()`: the response does not make the user wait for a
 * lost webhook, and the next display will be correct.
 */
async function sweepRepo(userId: string, repo: VisibleRepo): Promise<boolean> {
  try {
    const target = await resolveRepoCloneTargetForRepo({
      userId,
      provider: repo.provider,
      repoFullName: repo.repoFullName,
    });
    if (!target) return false;
    const { truncated } = await syncRepoPullRequests({
      provider: repo.provider,
      repoFullName: repo.repoFullName,
      token: target.token,
    });
    return truncated;
  } catch (err) {
    console.error(
      `[pull-requests] sweep ${repo.repoFullName} failed:`,
      (err as Error).message,
    );
    // We stamp all the same: a broken down forge should not make the user try again.
    // scan EACH view of the page. The list remains as before, and
    // the next window will try again.
    await stampRepoSync(repo.provider, repo.repoFullName);
    return false;
  }
}

/**
 * PR targeted by a deep-link (direct `?pr=`, historical `?run=`) when the page
 * does not contain it — the list is limited, a link is not.
 *
 * It is read in service key, so access is rechecked here: the PR must
 * belong to a repository that this user sees. Returns null if it is already
 * in the page, not found, or outside its scope.
 */
async function pinnedRow(
  supabase: SupabaseClient,
  params: URLSearchParams,
  repos: VisibleRepo[],
  page: PullRequestWithIssue[],
): Promise<PullRequestWithIssue | null> {
  const prId = params.get("pr");
  const runId = params.get("run");
  if (!prId && !runId) return null;

  let pr = prId ? await findPullRequest(prId) : null;
  if (!pr && runId) {
    const run = await getRun(runId);
    pr = run ? await resolvePrForRun(run) : null;
  }
  if (!pr) return null;
  const found = pr;
  if (page.some((row) => row.id === found.id)) return null;

  const visible = new Set(repos.map((r) => repoSyncKey(r.provider, r.repoFullName)));
  if (!visible.has(repoSyncKey(rowProvider(found), found.repo_full_name))) return null;

  // The ticket travels with it, read by the AUTHENTIFIED customer: its RLS makes it null
  // if it is in the trash, exactly as on the lines of the page.
  let issue: PullRequestWithIssue["issue"] = null;
  if (found.issue_id) {
    const { data } = await supabase
      .from("issues")
      .select("id, number, title, project_id")
      .eq("id", found.issue_id)
      .maybeSingle();
    issue = (data as PullRequestWithIssue["issue"]) ?? null;
  }
  return { ...found, issue };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const stateParam = params.get("state") ?? "open";
  const states = STATE_FILTERS[stateParam] ?? null; // null = all states
  const limit = Math.min(
    Math.max(Number.parseInt(params.get("limit") ?? "", 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const repos = await listVisibleRepos(auth.supabase);
  if (repos.length === 0) {
    return NextResponse.json({
      pullRequests: [],
      hasMore: false,
      truncated: false,
      repoCount: 0,
      anyPr: false,
    });
  }

  // ── Rattrapage ────────────────────────────────────────────────────────────
  const syncs = await readRepoSyncStates(repos);
  const seen = new Set<string>();
  // Cut seen by a BLOCKING scan of this request: `syncs` has been read
  // BEFORE him and still said “never swept” for this deposit. Without this postponement, the
  // very first display of a deposit of more than MAX_PR_PAGES × 100 PR se
  // would be silent about the cut — precisely the lie by omission that is being corrected.
  let sweptTruncated = false;
  for (const repo of repos) {
    const key = repoSyncKey(repo.provider, repo.repoFullName);
    if (seen.has(key)) continue;
    seen.add(key);
    const state = syncs.get(key);
    if (!needsRepoSync(state)) continue;
    if (state) after(() => sweepRepo(auth.user.id, repo));
    else if (await sweepRepo(auth.user.id, repo)) sweptTruncated = true;
  }

  // ── PR ──────────────────────────────── ────────────────────────────────
  let rows: PullRequestWithIssue[];
  try {
    // +1 for knowing if there are any left, not including the entire table.
    rows = await listPullRequestsForUser(auth.supabase, repos, {
      limit: limit + 1,
      states: states ?? undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Deep-link PINED. Without that, a PR older than the page (a ticket
  // closed months ago) would be missing from the list, and the page would fall back
  // silently on the first — i.e. would open the PR of another
  // ticket without signaling anything.
  const pinned = await pinnedRow(auth.supabase, params, repos, page);
  if (pinned) page.unshift(pinned);

  // ── Runs, as decoration ─────────────────────── ────────────────────────
  // RLS `agent_runs` = can_access_project: we only see ours. Restricted
  // to the numbers on THIS page — the list of runs for an active account is long,
  // and we only need those who decorate what we display.
  const numbers = [...new Set(page.map((p) => p.number))];
  const runsByPr = new Map<string, RunRow[]>();
  if (numbers.length > 0) {
    const { data } = await auth.supabase
      .from("agent_runs")
      .select("id, status, pr_number, created_at, repo_link:project_git_links(provider, repo_full_name)")
      .in("pr_number", numbers)
      .order("created_at", { ascending: true });
    for (const run of (data ?? []) as unknown as RunRow[]) {
      const link = run.repo_link;
      if (!link?.repo_full_name || run.pr_number == null) continue;
      const key = `${link.provider}:${link.repo_full_name}:${run.pr_number}`;
      const list = runsByPr.get(key);
      if (list) list.push(run);
      else runsByPr.set(key, [run]);
    }
  }

  const projectById = new Map(repos.map((r) => [r.project.id, r.project]));
  const projectByRepo = new Map(
    repos.map((r) => [repoSyncKey(r.provider, r.repoFullName), r.project]),
  );

  const pullRequests: PullRequestListItem[] = page.map((row) => {
    const provider = rowProvider(row);
    const runs = runsByPr.get(`${provider}:${row.repo_full_name}:${row.number}`) ?? [];
    const working = runs.filter((r) => WORKING_STATUSES.includes(r.status));
    // `issue_id` entered but zero nested resource = ticket in the trash
    // (MIN-133). RA remains in the list, simply DETACHED: it exists
    // at the forge, and hiding it would again show half the deposit.
    const issue = row.issue;
    return {
      prId: row.id,
      pr_number: row.number,
      pr_url: row.url,
      pr_state: row.state,
      provider,
      title: row.title,
      author: row.author_login
        ? { login: row.author_login, avatar_url: row.author_avatar_url }
        : null,
      head_branch: row.head_branch,
      created_at: row.opened_at ?? row.updated_at,
      updated_at: row.updated_at,
      issue: issue ? { id: issue.id, number: issue.number, title: issue.title } : null,
      project:
        (issue ? projectById.get(issue.project_id) : null) ??
        projectByRepo.get(repoSyncKey(provider, row.repo_full_name)) ??
        null,
      runId: runs[0]?.id ?? null,
      activeRunId: working[0]?.id ?? null,
      busyRunId: working[0]?.id ?? null,
      runIds: runs.map((r) => r.id),
    };
  });

  // A cut forge pagination must be SEEN: the list is not exhaustive,
  // and to keep silent is to lie by omission — exactly what MIN-143 corrects.
  const truncated = sweptTruncated || [...seen].some((key) => syncs.get(key)?.truncated);

  // Empty FOR THIS STATE does not simply mean empty: one line, all
  // states combined, is enough to decide — and we only ask it in this case.
  const anyPr =
    page.length > 0
      ? true
      : states
        ? (await listPullRequestsForUser(auth.supabase, repos, { limit: 1 })).length > 0
        : false;

  return NextResponse.json({
    pullRequests,
    hasMore,
    truncated,
    repoCount: repos.length,
    anyPr,
  });
}
