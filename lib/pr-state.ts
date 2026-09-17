import type { PullRequestListItem } from "./agent-api";

/**
 * The four minddy words for the state of a pull request — the type of
 * `PullRequestListItem["pr_state"]`, spelled out once for the modules that
 * normalize a forge observation without needing the whole list item.
 */
export type PullRequestItemState = PullRequestListItem["pr_state"];

/**
 * Minddy state of a pull request, read from what the forge GET returned —
 * the client twin of `prStateFromRef` (`lib/server/agent/pull-requests.ts`),
 * which serves the same rule on the ingestion side. Both MUST keep saying the
 * same thing: this one feeds the live propagation of the open panel into the
 * sidebar list (`components/pull-requests/pr-detail.tsx`), the other writes
 * `pull_requests.state`.
 *
 * ORDER is the whole rule: merged wins over closed (both forges close a PR
 * when they merge it), and a draft is only a draft as long as it is open.
 */
export function pullRequestStateFromRef(ref: {
  state: string;
  draft?: boolean | null;
  merged?: boolean | null;
}): PullRequestItemState {
  if (ref.merged) return "merged";
  if (ref.state === "closed") return "closed";
  return ref.draft ? "draft" : "open";
}

/**
 * The state the OPEN panel may push into the sidebar list, when the forge GET
 * it just reread disagrees with the list's — `null` when there is nothing to
 * push. This is what keeps the column in step with the panel when a merge
 * lands in the background (“Generate then merge”) or the gesture was made on
 * the forge: the panel refetched `pr` on its own topic, the list did not.
 *
 * Two monotonic guards decide, and both say the same thing — an observation
 * older than what we already know must never overwrite it:
 * - the forge timestamp of the GET against the list's own `updated_at` (a GET
 *   that left before an in-app merge and lands after it);
 * - when the GET was RECEIVED against the panel's last local state write
 *   (`notBefore`): a GET that came back before the click says nothing about
 *   the click, whatever its forge timestamp.
 * Without a forge timestamp there is nothing to order by, and the list's own
 * refetch (the `pull_requests` write broadcast) remains the net.
 */
export function pullRequestStateToPropagate(
  ref: {
    state: string;
    draft?: boolean | null;
    merged?: boolean | null;
    updatedAt?: string;
  },
  item: { pr_state: PullRequestItemState; updated_at: string },
  opts: { fetchedAt?: number; notBefore?: number } = {},
): PullRequestItemState | null {
  const state = pullRequestStateFromRef(ref);
  if (state === item.pr_state) return null;
  if ((opts.fetchedAt ?? 0) < (opts.notBefore ?? 0)) return null;
  if (!ref.updatedAt) return null;
  const at = Date.parse(ref.updatedAt);
  if (!Number.isFinite(at) || at <= Date.parse(item.updated_at)) return null;
  return state;
}
