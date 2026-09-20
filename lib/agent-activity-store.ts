import type { IssuePr } from "@/lib/agent-api";

export interface AgentActivityPayload {
  workingIssueIds?: string[];
  sessionIssueIds?: string[];
  sessionConversations?: Record<string, string>;
  pullRequests?: Record<string, IssuePr>;
}

interface IssueActivity {
  working: boolean;
  session: boolean;
  conversation: string | null;
  pr: IssuePr | null;
}

const EMPTY: IssueActivity = {
  working: false,
  session: false,
  conversation: null,
  pr: null,
};

function samePr(left: IssuePr | null, right: IssuePr | null): boolean {
  return left === right || (!!left && !!right && left.prId === right.prId &&
    left.prNumber === right.prNumber && left.state === right.state);
}

/** One poll, with notifications limited to issues whose visible state changed. */
export function createAgentActivityStore(initial?: AgentActivityPayload) {
  let activities = new Map<string, IssueActivity>();
  const listeners = new Map<string, Set<() => void>>();
  const store = {
    get: (issueId: string): IssueActivity => activities.get(issueId) ?? EMPTY,
    subscribe(issueId: string, listener: () => void) {
      let issueListeners = listeners.get(issueId);
      if (!issueListeners) listeners.set(issueId, issueListeners = new Set());
      issueListeners.add(listener);
      return () => {
        issueListeners.delete(listener);
        if (issueListeners.size === 0) listeners.delete(issueId);
      };
    },
    update(payload?: AgentActivityPayload) {
      const working = new Set(payload?.workingIssueIds ?? []);
      const session = new Set(payload?.sessionIssueIds ?? []);
      const conversations = payload?.sessionConversations ?? {};
      const prs = payload?.pullRequests ?? {};
      const ids = new Set([
        ...working, ...session, ...Object.keys(conversations), ...Object.keys(prs),
      ]);
      const next = new Map<string, IssueActivity>();
      const changed = new Set(activities.keys());
      for (const id of ids) {
        const previous = store.get(id);
        const pr = prs[id] ?? null;
        const value = {
          working: working.has(id),
          session: session.has(id),
          conversation: conversations[id] ?? null,
          pr: samePr(previous.pr, pr) ? previous.pr : pr,
        };
        if (previous.working === value.working && previous.session === value.session &&
          previous.conversation === value.conversation && previous.pr === value.pr) {
          next.set(id, previous);
          changed.delete(id);
        } else {
          next.set(id, value);
          changed.add(id);
        }
      }
      activities = next;
      for (const id of changed) {
        for (const listener of listeners.get(id) ?? []) listener();
      }
    },
  };
  store.update(initial);
  return store;
}

export type AgentActivityStore = ReturnType<typeof createAgentActivityStore>;
