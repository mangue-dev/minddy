import "server-only";

import { pullRequestTopic, type PrLivePart } from "@/lib/pr-live";
import type { RepoProviderId } from "@/lib/repo-providers";
import { broadcastToTopic } from "./live";
import { findPullRequestByNumber } from "./pull-requests";

/**
 * LIVE broadcast of a pull request, on the private topic
 * `pull-request:{prId}` (migration 20260929090000_pull_request_realtime).
 *
 * A single message, `changed`, and it only says one thing: this part of this
 * PR has moved. The content does not travel — it is read at the forge, with the READER's token
 *, and it is not the same for everyone (a reaction carries a
 * `viewerIsActor`, the gestures offered depend on `viewer.capability`). It's
 * the screen which will reread, with its own eyes (see lib/pr-live.ts).
 *
 * Two families of transmitters, and you need both:
 * - WEBHOOK RECEIVERS, for what happens on the forge ;
 * - in-app writing ROUTES (`pr-actions.ts`), otherwise a teammate who
 * looks at the same PR would not see anything before the webhook echo — and on the GitHub side there
 * is NO echo for reactions, the event does not exist.
 *
 * Everything is best-effort and fire-and-forget: a failed broadcast should never
 * cause a webhook or a user gesture to fail. The residual polling and
 * the refetch when returning to the tab remain the net.
 */

/** “These parts of this PR have moved. » */
export function broadcastPrChanged(prId: string, parts: PrLivePart[]): void {
  if (parts.length === 0) return;
  void broadcastToTopic(pullRequestTopic(prId), "changed", {
    parts,
    at: Date.now(),
  });
}

/**
 * The same thing, when you only know a NUMBER in a repository: it's all that
 * that a webhook carries. Silent if the PR is not (yet) at minddy —
 * no one can look at it, there is no one to warn.
 *
 * `await` on resolution, `void` on sending: reading is what gives
 * the id, the sending is what we don't expect.
 */
export async function broadcastPrChangedByNumber(opts: {
  provider: RepoProviderId;
  repoFullName: string;
  number: number;
  parts: PrLivePart[];
}): Promise<void> {
  if (opts.parts.length === 0) return;
  try {
    const pr = await findPullRequestByNumber({
      provider: opts.provider,
      repoFullName: opts.repoFullName,
      number: opts.number,
    });
    if (!pr) return;
    broadcastPrChanged(pr.id, opts.parts);
  } catch (err) {
    console.error("[pr-live] broadcast failed:", (err as Error).message);
  }
}
