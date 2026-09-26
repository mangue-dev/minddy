import { after, NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  countPullRequestsForUser,
  listVisibleRepos,
  needsRepoSync,
  readRepoSyncStates,
  repoSyncKey,
} from "@/lib/server/agent/pull-requests";
import { sweepRepo } from "@/lib/server/agent/pull-requests-sweep";

/**
 * Badge count of open pull requests (MIN-66): read by the app shell on EVERY
 * page, polled every minute by the client (MIN-595).
 *
 * The count itself is a `head: true` aggregate — nothing to sweep before
 * answering, the response is instant. The out-of-band work is what makes the
 * badge self-healing: repositories whose `synced_at` left the TTL window get
 * swept in `after()`, the same out-of-band catch-up the Pull Requests page
 * runs. A PR opened (or merged) at the forge without a webhook therefore
 * enters the count within a TTL window, WITHOUT the user visiting the PR page —
 * the exact complaint MIN-595 records. The row write then broadcasts on the
 * project topic and the realtime bridge refreshes this very cache.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    const repos = await listVisibleRepos(auth.supabase);
    const count = await countPullRequestsForUser(auth.supabase, repos, [
      "open",
      "draft",
    ]);

    // Out-of-band catch-up, deduplicated by the `pull_request_syncs` stamp:
    // concurrent readers of the same window coalesce into one forge read.
    const syncs = await readRepoSyncStates(repos);
    const seen = new Set<string>();
    for (const repo of repos) {
      const key = repoSyncKey(repo.provider, repo.repoFullName);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!needsRepoSync(syncs.get(key))) continue;
      after(() => sweepRepo(auth.user.id, repo));
    }

    return NextResponse.json({ count });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to count pull requests",
      },
      { status: 500 },
    );
  }
}
