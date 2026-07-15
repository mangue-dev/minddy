"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * Contexte « état de l'agent par issue » (MIN-46). Un seul poll par board expose
 * deux ensembles d'issue_ids :
 *   • working  — l'agent TRAVAILLE (queued/running) → halo animé sur la carte ;
 *   • session  — une session reprennable existe (working OU au repos needs_input)
 *                → l'entrée de la carte propose « Ouvrir l'agent » plutôt que
 *                  « Lancer un agent ».
 * Polling adaptatif : rapide tant qu'un agent travaille, lent sinon (les sessions
 * au repos ne changent pas d'elles-mêmes).
 *
 * Deux modes : `projectId` fourni → un projet ; `projectId` absent → GLOBAL (board
 * « Tous les tickets », cross-projet — la RLS borne aux projets accessibles).
 */

interface AgentActivity {
  working: Set<string>;
  session: Set<string>;
}

const EMPTY: AgentActivity = { working: new Set(), session: new Set() };
const AgentActivityContext = createContext<AgentActivity>(EMPTY);

async function fetchAgentActivity(
  projectId: string | null | undefined,
): Promise<{ workingIssueIds: string[]; sessionIssueIds: string[] }> {
  const url = projectId
    ? `/api/projects/${projectId}/agent-runs`
    : `/api/agent-activity`;
  const res = await fetch(url);
  if (!res.ok) return { workingIssueIds: [], sessionIssueIds: [] };
  const data = (await res.json()) as {
    workingIssueIds?: string[];
    sessionIssueIds?: string[];
  };
  return {
    workingIssueIds: data.workingIssueIds ?? [],
    sessionIssueIds: data.sessionIssueIds ?? [],
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
  const workingKey = working.slice().sort().join(",");
  const sessionKey = session.slice().sort().join(",");
  // Sets stables tant que les listes ne changent pas (évite de re-render toutes
  // les cartes à chaque poll).
  const value = useMemo(
    () => ({ working: new Set(working), session: new Set(session) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workingKey, sessionKey],
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
