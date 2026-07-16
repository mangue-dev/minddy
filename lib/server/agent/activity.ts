// Dérivation PURE (sans DB, sans import server-only) : testable en node/vitest,
// comme prune.ts / caching.ts.

/**
 * Construction partagée de la réponse « activité de l'agent par issue » (MIN-46),
 * utilisée par l'endpoint projet ET l'endpoint global. Prend les runs de l'agent
 * (triés created_at DESC, hors `failed`) et en dérive trois vues.
 */

export interface AgentRunRow {
  issue_id: string;
  status: string;
  id: string;
  pr_number: number | null;
  pr_state: string | null;
  created_at: string;
}

export interface AgentActivityResponse {
  /** L'agent TRAVAILLE (queued/running) → halo animé sur la carte. */
  workingIssueIds: string[];
  /**
   * Une CONVERSATION d'agent existe sur l'issue (au moins une run non `failed`,
   * au travail ou au repos) → l'entrée de la carte OUVRE la conversation au lieu
   * d'en lancer une nouvelle (modèle conversationnel : une session au repos se
   * poursuit depuis son composer).
   */
  sessionIssueIds: string[];
  /** PR la plus récente par issue (open/draft/merged, pas closed) → chip
   *  « PR disponible » sur la carte, cliquable vers la review. */
  pullRequests: Record<string, { runId: string; prNumber: number }>;
}

export function buildAgentActivity(rows: AgentRunRow[]): AgentActivityResponse {
  const workingIssueIds = [
    ...new Set(
      rows
        .filter((r) => r.status === "queued" || r.status === "running")
        .map((r) => r.issue_id),
    ),
  ];
  // `rows` exclut déjà les runs `failed` (contrat des endpoints appelants).
  const sessionIssueIds = [...new Set(rows.map((r) => r.issue_id))];
  const pullRequests: Record<string, { runId: string; prNumber: number }> = {};
  for (const r of rows) {
    // rows triés DESC → le premier vu par issue est le plus récent.
    if (r.pr_number != null && r.pr_state !== "closed" && !pullRequests[r.issue_id]) {
      pullRequests[r.issue_id] = { runId: r.id, prNumber: r.pr_number };
    }
  }
  return { workingIssueIds, sessionIssueIds, pullRequests };
}
