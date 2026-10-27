import type { AgentRunPrResponse, PullRequestListItem } from "./agent-api";
import { pullRequestStateToPropagate } from "./pr-state";

type Readiness = NonNullable<AgentRunPrResponse["readiness"]>;

/**
 * One PR state for the whole page (MIN-817). The list row, the grouped
 * readiness read and the detail cache each have their own freshness; the
 * newest observation wins and is written back to the list:
 * - a detail read (the forge's GET) wins when the forge timestamp is newer
 *   than the row's, and when it was received after the page's own last write
 *   on that PR (`pullRequestStateToPropagate`);
 * - a readiness read that says "merged" always wins, since a merge cannot be
 *   undone. "closed" is not taken from readiness: without a timestamp it
 *   could roll back a reopen the list already knows about.
 */
export function pullRequestStatesToReconcile(
  rows: readonly PullRequestListItem[],
  sources: {
    detail: (prId: string) => { pr: AgentRunPrResponse["pr"] | null | undefined; fetchedAt: number } | undefined;
    readinessByPrId: Readonly<Record<string, Readiness>>;
    notBefore: (prId: string) => number;
  },
): Array<{ prId: string; state: PullRequestListItem["pr_state"] }> {
  const changes: Array<{ prId: string; state: PullRequestListItem["pr_state"] }> = [];
  for (const row of rows) {
    const detail = sources.detail(row.prId);
    const fromDetail = detail?.pr
      ? pullRequestStateToPropagate(detail.pr, row, { fetchedAt: detail.fetchedAt, notBefore: sources.notBefore(row.prId) })
      : null;
    if (fromDetail) {
      changes.push({ prId: row.prId, state: fromDetail });
      continue;
    }
    if (sources.readinessByPrId[row.prId]?.state === "merged" && row.pr_state !== "merged") {
      changes.push({ prId: row.prId, state: "merged" });
    }
  }
  return changes;
}
