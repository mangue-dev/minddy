// Dérivation PURE (sans DB, sans import server-only) : testable en node/vitest,
// comme prune.ts / caching.ts.

/**
 * Construction partagée de la réponse « activité de l'agent par issue » (MIN-46),
 * utilisée par l'endpoint projet ET l'endpoint global. Prend les runs de l'agent
 * (triés created_at DESC, hors `failed`) et en dérive trois vues.
 *
 * La PR, elle, ne vient PLUS des runs. Elle en venait, et ça faisait dire au
 * ticket « je n'ai pas de pull request » dans deux cas où il en avait une :
 * quand personne n'avait lancé Numo dessus (PR humaine rattachée par convention,
 * ou rattachée à la main depuis le header — MIN-163), et quand la PR était
 * FERMÉE. Depuis MIN-143 la pull request est une entité : c'est elle qu'on lit.
 */

export interface AgentRunRow {
  issue_id: string;
  status: string;
  id: string;
  pr_number: number | null;
  pr_state: string | null;
  created_at: string;
}

/** Ligne `pull_requests` rattachée à un ticket, triée `updated_at` DESC. */
export interface IssuePrRow {
  id: string;
  issue_id: string | null;
  number: number;
  state: string;
  updated_at: string;
}

/** La pull request d'un ticket, telle que le client la reçoit. */
export interface IssuePrRef {
  /** Id minddy — le deep-link `?pr=` marche quel que soit l'état de la PR. */
  prId: string;
  prNumber: number;
  state: "draft" | "open" | "merged" | "closed";
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
  /**
   * PR du ticket, TOUS ÉTATS CONFONDUS — l'entrée « Voir la pull request » des
   * menus doit y mener même fermée. Le chip de la carte, lui, ne s'affiche que
   * sur une PR non fermée : c'est le client qui fait ce tri, avec `state`.
   */
  pullRequests: Record<string, IssuePrRef>;
}

const LIVE_STATES = new Set(["draft", "open"]);

function prState(raw: string): IssuePrRef["state"] {
  return raw === "draft" || raw === "merged" || raw === "closed" ? raw : "open";
}

/**
 * La PR d'un ticket qui en porte plusieurs (runs successifs : une PR refusée,
 * puis celle qui la remplace). Une PR VIVANTE gagne toujours — c'est celle qu'on
 * va relire ; à défaut, la plus récemment touchée chez la forge.
 */
export function pickIssuePullRequests(rows: IssuePrRow[]): Record<string, IssuePrRef> {
  const picked: Record<string, IssuePrRef> = {};
  const pickedLive = new Set<string>();
  // `rows` arrive trié updated_at DESC : le premier vu d'un ticket est le plus
  // frais, et on ne le remplace que par une PR vivante.
  for (const row of rows) {
    if (!row.issue_id) continue;
    const live = LIVE_STATES.has(row.state);
    if (picked[row.issue_id] && (pickedLive.has(row.issue_id) || !live)) continue;
    picked[row.issue_id] = {
      prId: row.id,
      prNumber: row.number,
      state: prState(row.state),
    };
    if (live) pickedLive.add(row.issue_id);
  }
  return picked;
}

export function buildAgentActivity(
  rows: AgentRunRow[],
  prRows: IssuePrRow[] = [],
): AgentActivityResponse {
  const workingIssueIds = [
    ...new Set(
      rows
        .filter((r) => r.status === "queued" || r.status === "running")
        .map((r) => r.issue_id),
    ),
  ];
  // `rows` exclut déjà les runs `failed` (contrat des endpoints appelants).
  const sessionIssueIds = [...new Set(rows.map((r) => r.issue_id))];
  return {
    workingIssueIds,
    sessionIssueIds,
    pullRequests: pickIssuePullRequests(prRows),
  };
}
