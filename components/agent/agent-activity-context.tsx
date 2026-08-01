"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IssuePr } from "@/lib/agent-api";

/**
 * Contexte « état de l'agent par issue » (MIN-46). Un seul poll par board expose
 * deux ensembles d'issue_ids :
 *   • working  — l'agent TRAVAILLE (queued/running) → halo animé sur la carte ;
 *   • session  — une CONVERSATION existe (au moins une run non `failed`, au travail
 *                ou au repos) → l'entrée de la carte propose « Ouvrir l'agent »
 *                plutôt que « Lancer un agent ».
 * …plus la PULL REQUEST de chaque ticket, qui n'est PAS une affaire d'agent (une
 * PR humaine en est une aussi) mais voyage ici parce que c'est le même poll.
 *
 * Polling adaptatif : rapide tant qu'un agent travaille, lent sinon (les sessions
 * au repos ne changent pas d'elles-mêmes).
 *
 * Deux modes : `projectId` fourni → un projet ; `projectId` absent → GLOBAL (board
 * « Tous les tickets », cross-projet — la RLS borne aux projets accessibles).
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

async function fetchAgentActivity(
  projectId: string | null | undefined,
): Promise<Required<ActivityPayload>> {
  const url = projectId
    ? `/api/projects/${projectId}/agent-runs`
    : `/api/agent-activity`;
  const res = await fetch(url);
  if (!res.ok) return { workingIssueIds: [], sessionIssueIds: [], pullRequests: {} };
  const data = (await res.json()) as ActivityPayload;
  return {
    workingIssueIds: data.workingIssueIds ?? [],
    sessionIssueIds: data.sessionIssueIds ?? [],
    pullRequests: data.pullRequests ?? {},
  };
}

export function AgentActivityProvider({
  projectId,
  children,
}: {
  /** Absent/null → mode GLOBAL (tous projets accessibles). */
  projectId?: string | null;
  children: ReactNode;
}) {
  const { data } = useQuery({
    queryKey: ["agent-active-issues", projectId ?? "__global__"],
    queryFn: () => fetchAgentActivity(projectId),
    // Rapide tant qu'un agent travaille ; lent sinon (les sessions au repos sont
    // stables jusqu'à une action utilisateur).
    refetchInterval: (query) =>
      (query.state.data?.workingIssueIds?.length ?? 0) > 0 ? 4000 : 15000,
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
  // Sets/Map stables tant que les listes ne changent pas (évite de re-render toutes
  // les cartes à chaque poll).
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

/** True si un agent TRAVAILLE actuellement sur cette issue (pilote le halo). */
export function useAgentActive(issueId: string): boolean {
  return useContext(AgentActivityContext).working.has(issueId);
}

/** True si une session d'agent reprennable existe sur cette issue (travail ou repos). */
export function useAgentHasSession(issueId: string): boolean {
  return useContext(AgentActivityContext).session.has(issueId);
}

/**
 * La pull request de ce ticket, TOUS ÉTATS CONFONDUS, ou null.
 *
 * Tous états : « Voir la pull request » doit mener à une PR fermée comme à une
 * PR ouverte. C'est l'appelant qui écarte `closed` là où ça a du sens — le chip
 * « PR disponible » de la carte, qui ne parle que de ce qui appelle encore une
 * action (`isPrWorthShowing`).
 */
export function useIssuePr(issueId: string): IssuePr | null {
  return useContext(AgentActivityContext).prs.get(issueId) ?? null;
}
