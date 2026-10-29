import type { IssuePr, PullRequestMergeFlow } from "@/lib/agent-api";
import type { PullRequestReadiness } from "@/lib/pr-readiness";

/** A live pull request's merge readiness, as the Code review page shows it. */
export interface IssuePrReadiness {
  readiness: PullRequestReadiness | null;
  unavailable: boolean;
  /** Auto-merge state and merge authority, once the batch has read them. */
  flow?: PullRequestMergeFlow | null;
}

function sameFlow(left: PullRequestMergeFlow | null | undefined, right: PullRequestMergeFlow | null | undefined): boolean {
  return left === right || (!!left && !!right && left.active === right.active &&
    left.autoMergeAllowed === right.autoMergeAllowed && left.canWrite === right.canWrite);
}

export interface IssuePrPayload {
  pullRequests?: Record<string, IssuePr>;
  /** Every PR linked to each issue, in any state (the chip shows only one). */
  linkedPullRequestIds?: Record<string, string[]>;
}

function samePr(left: IssuePr | null, right: IssuePr | null): boolean {
  return left === right || (!!left && !!right && left.prId === right.prId &&
    left.prNumber === right.prNumber && left.state === right.state);
}

/** One poll, with notifications limited to issues whose pull request changed. */
export function createIssuePrStore(initial?: IssuePrPayload) {
  let prs = new Map<string, IssuePr>();
  let readiness = new Map<string, IssuePrReadiness>();
  let linkedIds: Record<string, string[]> = {};
  const listeners = new Map<string, Set<() => void>>();
  const notify = (issueId: string) => {
    for (const listener of listeners.get(issueId) ?? []) listener();
  };
  const store = {
    get: (issueId: string): IssuePr | null => prs.get(issueId) ?? null,
    /** Readiness of the issue's pull request, kept per PR. */
    getReadiness: (issueId: string): IssuePrReadiness | null => {
      const pr = prs.get(issueId);
      return pr ? readiness.get(pr.prId) ?? null : null;
    },
    /** Every PR linked to the issue, in any state, for actions over a selection. */
    linkedPullRequestIds: (issueId: string): readonly string[] =>
      linkedIds[issueId] ?? (prs.get(issueId) ? [prs.get(issueId)!.prId] : []),
    subscribe(issueId: string, listener: () => void) {
      let issueListeners = listeners.get(issueId);
      if (!issueListeners) listeners.set(issueId, issueListeners = new Set());
      issueListeners.add(listener);
      return () => {
        issueListeners.delete(listener);
        if (issueListeners.size === 0) listeners.delete(issueId);
      };
    },
    update(payload?: IssuePrPayload) {
      linkedIds = payload?.linkedPullRequestIds ?? {};
      const incoming = payload?.pullRequests ?? {};
      const next = new Map<string, IssuePr>();
      const changed = new Set(prs.keys());
      for (const [id, pr] of Object.entries(incoming)) {
        const previous = store.get(id);
        if (samePr(previous, pr) && previous) {
          next.set(id, previous);
          changed.delete(id);
        } else {
          next.set(id, pr);
          changed.add(id);
        }
      }
      prs = next;
      for (const id of changed) notify(id);
    },
    /** Store one readiness batch; only issues whose PR's verdict moved re-render. */
    updateReadiness(
      byPrId: Record<string, PullRequestReadiness>,
      unavailablePrIds: ReadonlySet<string>,
      flowByPrId: Readonly<Record<string, PullRequestMergeFlow>> = {},
    ) {
      const next = new Map<string, IssuePrReadiness>();
      const changedPrs = new Set<string>();
      for (const prId of new Set([...Object.keys(byPrId), ...unavailablePrIds, ...readiness.keys()])) {
        const value: IssuePrReadiness = {
          readiness: byPrId[prId] ?? null,
          unavailable: unavailablePrIds.has(prId),
          flow: flowByPrId[prId] ?? null,
        };
        const previous = readiness.get(prId);
        if (!value.readiness && !value.unavailable) {
          if (previous) changedPrs.add(prId);
          continue;
        }
        if (previous && previous.unavailable === value.unavailable &&
          previous.readiness?.state === value.readiness?.state &&
          previous.readiness?.mergeAllowed === value.readiness?.mergeAllowed &&
          previous.readiness?.preferredMethod === value.readiness?.preferredMethod &&
          sameFlow(previous.flow, value.flow)) {
          next.set(prId, previous);
        } else {
          next.set(prId, value);
          changedPrs.add(prId);
        }
      }
      readiness = next;
      if (changedPrs.size === 0) return;
      for (const [issueId, pr] of prs) if (changedPrs.has(pr.prId)) notify(issueId);
    },
  };
  store.update(initial);
  return store;
}

export type IssuePrStore = ReturnType<typeof createIssuePrStore>;
