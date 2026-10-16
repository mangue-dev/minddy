import type { IssuePr } from "@/lib/agent-api";

export interface IssuePrPayload {
  pullRequests?: Record<string, IssuePr>;
}

function samePr(left: IssuePr | null, right: IssuePr | null): boolean {
  return left === right || (!!left && !!right && left.prId === right.prId &&
    left.prNumber === right.prNumber && left.state === right.state);
}

/** One poll, with notifications limited to issues whose pull request changed. */
export function createIssuePrStore(initial?: IssuePrPayload) {
  let prs = new Map<string, IssuePr>();
  const listeners = new Map<string, Set<() => void>>();
  const store = {
    get: (issueId: string): IssuePr | null => prs.get(issueId) ?? null,
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
      for (const id of changed) {
        for (const listener of listeners.get(id) ?? []) listener();
      }
    },
  };
  store.update(initial);
  return store;
}

export type IssuePrStore = ReturnType<typeof createIssuePrStore>;
