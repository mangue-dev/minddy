"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IssuePr } from "@/lib/agent-api";

/**
 * Context “agent state by issue” (MIN-46). Only one poll per board exposed
 * deux ensembles d'issue_ids :
 * • working — the agent is WORKING (queued/running) → animated halo on the map;
 * • session — a CONVERSATION exists (at least one non `failed` run, at work
 * or at rest) → the card entry suggests “Open agent”
 * rather than “Launch an agent”.
 * …plus the PULL REQUEST of each ticket, which is NOT an agent matter (a
 * Human PR is one too) but travel here because it's the same poll.
 *
 * Adaptive polling: fast as long as an agent is working, slow otherwise (sessions
 * at rest do not change by themselves).
 *
 * Two modes: `projectId` provided → a project; `projectId` absent → GLOBAL (board
 * “All tickets”, cross-project — the RLS limits to accessible projects).
 */

interface AgentActivity {
  working: Set<string>;
  session: Set<string>;
  prs: Map<string, IssuePr>;
}

const EMPTY: AgentActivity = {
  working: new Set(),
  session: new Set(),
  prs: new Map(),
};
const AgentActivityContext = createContext<AgentActivity>(EMPTY);

type ActivityPayload = {
  workingIssueIds?: string[];
  sessionIssueIds?: string[];
  pullRequests?: Record<string, IssuePr>;
};

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

  const working = data?.workingIssueIds ?? [];
  const session = data?.sessionIssueIds ?? [];
  const prs = data?.pullRequests ?? {};
  const workingKey = working.slice().sort().join(",");
  const sessionKey = session.slice().sort().join(",");
  const prsKey = Object.entries(prs)
    .map(([k, v]) => `${k}:${v.prId}:${v.state}`)
    .sort()
    .join(",");
  // Sets/Map stable as long as the lists do not change (avoids re-rendering all
  // the cards at each poll).
  const value = useMemo(
    () => ({
      working: new Set(working),
      session: new Set(session),
      prs: new Map(Object.entries(prs)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workingKey, sessionKey, prsKey],
  );

  return (
    <AgentActivityContext.Provider value={value}>
      {children}
    </AgentActivityContext.Provider>
  );
}

/** True if an agent is currently WORKING on this issue (drives the halo). */
export function useAgentActive(issueId: string): boolean {
  return useContext(AgentActivityContext).working.has(issueId);
}

/** True if a resumeable agent session exists on this issue (work or rest). */
export function useAgentHasSession(issueId: string): boolean {
  return useContext(AgentActivityContext).session.has(issueId);
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
  return useContext(AgentActivityContext).prs.get(issueId) ?? null;
}
