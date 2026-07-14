"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * Contexte « quelles issues ont un agent en cours » (MIN-46). Le provider poll
 * (adaptatif : 4 s quand au moins un run tourne, sinon 15 s) l'endpoint projet et
 * expose l'ensemble des issue_ids actifs ; les cartes s'y abonnent pour afficher
 * le halo arc-en-ciel. Un seul poll par board (pas un par carte).
 */

const AgentActivityContext = createContext<Set<string>>(new Set());

async function fetchActiveIssueIds(projectId: string): Promise<string[]> {
  const res = await fetch(`/api/projects/${projectId}/agent-runs`);
  if (!res.ok) return [];
  const data = (await res.json()) as { activeIssueIds?: string[] };
  return data.activeIssueIds ?? [];
}

export function AgentActivityProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const { data } = useQuery({
    queryKey: ["agent-active-issues", projectId],
    queryFn: () => fetchActiveIssueIds(projectId),
    enabled: !!projectId,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 4000 : 15000),
  });

  const ids = data ?? [];
  const key = ids.slice().sort().join(",");
  // Set stable tant que la liste d'ids ne change pas (évite de re-render toutes
  // les cartes à chaque poll).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const set = useMemo(() => new Set(ids), [key]);

  return <AgentActivityContext.Provider value={set}>{children}</AgentActivityContext.Provider>;
}

/** True si un agent tourne actuellement sur cette issue. */
export function useAgentActive(issueId: string): boolean {
  return useContext(AgentActivityContext).has(issueId);
}
