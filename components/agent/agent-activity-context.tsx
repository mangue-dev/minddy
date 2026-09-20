"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { IssuePr } from "@/lib/agent-api";
import {
  createAgentActivityStore,
  type AgentActivityPayload,
  type AgentActivityStore,
} from "@/lib/agent-activity-store";

/**
 * One scoped poll supplies board halos, resumable conversations, and linked PRs.
 * Each card subscribes only to its own issue, so one active run does not replay
 * the other cards. Realtime handles idle transitions; polling backs up active work.
 */
const EMPTY_STORE = createAgentActivityStore();
const AgentActivityContext = createContext<AgentActivityStore>(EMPTY_STORE);
type ActivityPayload = AgentActivityPayload;

/**
 * The key to the survey. Exported because it is a CONTRACT with the filter of
 * persistence (lib/query-provider.tsx): copied by hand there, it had
 * diverged without anything saying so, and the survey was sent to disk each time
 * tick (MIN-303).
 */
export const agentActivityQueryKey = (
  projectId: string | null | undefined,
  projectIds: readonly string[] = [],
) => projectId
  ? (["agent-active-issues", projectId] as const)
  : (["agent-active-issues", "__global__", [...projectIds].sort().join(",")] as const);

/**
 * Realtime events cover idle-to-working and working-to-idle transitions. Keep
 * the short poll only while work is active as a resilience backstop; an idle
 * board otherwise has no state that can advance on its own.
 */
export function agentActivityPollInterval(
  workingIssueIds: readonly string[] | undefined,
): number | false {
  return (workingIssueIds?.length ?? 0) > 0 ? 4000 : false;
}

/**
 * ⚠ A failed request RISES. It does not render empty lists.
 *
 * Making `{ workingIssueIds: [], … }` to `!res.ok` stored the failure as a
 * SUCCESS: for react-query the truth became “no agent is working,
 * no session, no PR", and all the halos suddenly went out for
 * turn back on at the next tick. A complete round trip for a network outage
 * passenger — and, as long as the ticket card enveloped her body in a
 * `AgentBeam` without `keepMounted`, a dismantling of this entire body each time
 * bascule (MIN-301, MIN-302).
 *
 * When lifting, react-query keeps the previous data and retries.
 */
export async function fetchAgentActivity(
  projectId: string | null | undefined,
  projectIds: readonly string[] = [],
): Promise<Required<ActivityPayload>> {
  const url = projectId
    ? `/api/projects/${projectId}/agent-runs`
    : (() => {
        const params = new URLSearchParams();
        for (const id of [...new Set(projectIds)].sort()) params.append("projectId", id);
        const query = params.toString();
        return `/api/agent-activity${query ? `?${query}` : ""}`;
      })();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`agent-activity ${res.status}`);
  const data = (await res.json()) as ActivityPayload;
  return {
    workingIssueIds: data.workingIssueIds ?? [],
    sessionIssueIds: data.sessionIssueIds ?? [],
    sessionConversations: data.sessionConversations ?? {},
    pullRequests: data.pullRequests ?? {},
  };
}

export function AgentActivityProvider({
  projectId,
  projectIds = [],
  children,
}: {
  /** Absent/null → GLOBAL mode (all projects accessible). */
  projectId?: string | null;
  /** Projects currently represented by a global board. */
  projectIds?: readonly string[];
  children: ReactNode;
}) {
  const { data } = useQuery({
    queryKey: agentActivityQueryKey(projectId, projectIds),
    queryFn: () => fetchAgentActivity(projectId, projectIds),
    refetchInterval: (query) =>
      agentActivityPollInterval(query.state.data?.workingIssueIds),
  });

  const scope = JSON.stringify(agentActivityQueryKey(projectId, projectIds));
  // Replacing a scope must never expose the previous project's activity.
  const store = useMemo(() => createAgentActivityStore(), [scope]);
  useLayoutEffect(() => store.update(data), [store, data]);

  return (
    <AgentActivityContext.Provider value={store}>
      {children}
    </AgentActivityContext.Provider>
  );
}

/** Stable per-issue snapshot for cards that display all four activity fields. */
export function useIssueActivity(issueId: string) {
  const store = useContext(AgentActivityContext);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(issueId, listener),
    [store, issueId],
  );
  const getSnapshot = useCallback(() => store.get(issueId), [store, issueId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STORE.get(issueId));
}

function useIssueActivityValue<K extends keyof ReturnType<AgentActivityStore["get"]>>(
  issueId: string,
  field: K,
) {
  const store = useContext(AgentActivityContext);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(issueId, listener),
    [store, issueId],
  );
  const getSnapshot = useCallback(
    () => store.get(issueId)[field],
    [store, issueId, field],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STORE.get(issueId)[field]);
}

/** True if an agent is currently WORKING on this issue (drives the halo). */
export function useAgentActive(issueId: string): boolean {
  return useIssueActivityValue(issueId, "working");
}

/** True if a resumeable agent session exists on this issue (work or rest). */
export function useAgentHasSession(issueId: string): boolean {
  return useIssueActivityValue(issueId, "session");
}

/**
 * The common conversation to reopen for this issue, or null. Only the newest
 * run that carries one speaks; older sessions predate the shared identity.
 */
export function useIssueConversation(issueId: string): string | null {
  return useIssueActivityValue(issueId, "conversation");
}

/**
 * The pull request for this ticket, ALL STATES, or null.
 *
 * All states: “See pull request” should lead to a closed PR as well as to a
 * PR open. It's the caller who discards `closed` where it makes sense — the chip
 * “PR available” of the card, which only speaks of what still calls for a
 * action (`isPrWorthShowing`).
 */
export function useIssuePr(issueId: string): IssuePr | null {
  return useIssueActivityValue(issueId, "pr");
}
