import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PullRequestState } from "@/lib/pull-request-contract";
import {
  listPullRequestsForUser,
  needsRepoSync,
  readRepoSyncStates,
  repoForProject,
  repoSyncKey,
} from "@/lib/server/agent/pull-requests";
import { sweepRepo } from "@/lib/server/agent/pull-requests-sweep";

/**
 * `list_pull_requests` (MIN-1004): the pull requests of the project's linked
 * repository, so Numo finds one the user names from any page, including a PR
 * attached to no issue. The other PR tools then take its number.
 *
 * The rows come from `pull_requests` through the user's RLS client, like the
 * pull requests page. A repository whose last sweep is older than the page's
 * window is caught up first, so a PR opened a minute ago on a repository
 * without webhooks is listed too. The sweep is best effort: a forge outage
 * leaves the cached list.
 */

export type PullRequestListFilter = "open" | "merged" | "closed" | "all";

const STATES: Record<PullRequestListFilter, PullRequestState[] | undefined> = {
  open: ["open", "draft"],
  merged: ["merged"],
  closed: ["closed"],
  all: undefined,
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** Rows scanned when a text filter narrows them after the read. */
const SEARCH_WINDOW = 200;

export type PullRequestListOutcome = { result: unknown; success: boolean };

export async function listProjectPullRequests(
  ctx: { projectId: string; userId: string; supabase: SupabaseClient },
  args: Record<string, unknown>,
): Promise<PullRequestListOutcome> {
  const filter = (
    typeof args.state === "string" && args.state in STATES ? args.state : "open"
  ) as PullRequestListFilter;
  const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
  const requested = typeof args.limit === "number" ? Math.floor(args.limit) : DEFAULT_LIMIT;
  const limit = Math.min(Math.max(requested || DEFAULT_LIMIT, 1), MAX_LIMIT);

  const repo = await repoForProject(ctx.projectId);
  if (!repo) {
    return { result: { error: "This project has no linked repository." }, success: false };
  }

  const syncs = await readRepoSyncStates([repo]);
  const previous = syncs.get(repoSyncKey(repo.provider, repo.repoFullName));
  if (needsRepoSync(previous)) await sweepRepo(ctx.userId, repo, previous);

  const rows = await listPullRequestsForUser(ctx.supabase, [repo], {
    limit: (query ? SEARCH_WINDOW : limit) + 1,
    states: STATES[filter],
  });
  const matching = query
    ? rows.filter((row) =>
        [row.title, row.head_branch, row.author_login, `#${row.number}`]
          .some((value) => value?.toLowerCase().includes(query)),
      )
    : rows;
  const page = matching.slice(0, limit);

  return {
    result: {
      repository: repo.repoFullName,
      state: filter,
      count: page.length,
      has_more: matching.length > limit,
      pull_requests: page.map((row) => ({
        // minddy's id: what pull_request_id and the mention carry.
        id: row.id,
        number: row.number,
        title: row.title,
        state: row.state,
        url: row.url,
        author: row.author_login,
        head: row.head_branch,
        base: row.base_branch,
        updated_at: row.updated_at,
        issues: row.issues.map((issue) => ({
          id: issue.id,
          identifier: `${issue.project_key}-${issue.number}`,
          title: issue.title,
          status: issue.status,
        })),
      })),
    },
    success: true,
  };
}
