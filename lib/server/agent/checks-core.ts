/**
 * Normalisation des checks CI d'une PR/MR (MIN-138) — pur, sans I/O ni
 * `server-only`, donc testable en node (même patron que `branch-cleanup-core.ts`
 * et `mr-position.ts`). Les appelants (`pr.ts`, `mr.ts`) font les appels réseau
 * et passent ici les objets bruts.
 *
 * Le vocabulaire commun est réduit à quatre états, parce que c'est tout ce que
 * l'affichage sait dire : en cours, réussi, échoué, neutre. Les nuances des deux
 * forges (`cancelled`, `timed_out`, `skipped`, `manual`…) s'y replient.
 */

export type CheckState = "pending" | "success" | "failure" | "neutral";

export interface PullRequestCheck {
  name: string;
  state: CheckState;
  /** Page du check chez la forge, quand elle existe. */
  url: string | null;
}

export interface ChecksSummary {
  checks: PullRequestCheck[];
  /**
   * État agrégé : un échec l'emporte sur tout, puis un check en cours, sinon
   * réussi. `null` = aucun check du tout (dépôt sans CI) — distinct de
   * `checks: null` côté API, qui veut dire « on n'a pas pu lire ».
   */
  state: CheckState | null;
  /** Checks non bloquants (réussis OU neutres) — le `n` de « n/m réussis ». */
  passing: number;
  total: number;
}

/** Ordre d'affichage : ce qui demande une action d'abord. */
const SEVERITY: Record<CheckState, number> = {
  failure: 0,
  pending: 1,
  neutral: 2,
  success: 3,
};

/** Check run GitHub (`GET /commits/{sha}/check-runs`, `filter=latest` par défaut). */
export interface RawCheckRun {
  name?: string;
  status?: string; // queued | in_progress | completed | waiting | requested | pending
  conclusion?: string | null; // success | failure | neutral | cancelled | timed_out | action_required | skipped | stale
  html_url?: string | null;
  details_url?: string | null;
}

/** Commit status GitHub (`GET /commits/{sha}/status`). */
export interface RawCommitStatus {
  context?: string;
  state?: string; // pending | success | failure | error
  target_url?: string | null;
}

/** Pipeline GitLab (`GET /merge_requests/:iid/pipelines`). */
export interface RawPipeline {
  id?: number;
  status?: string; // created | waiting_for_resource | preparing | pending | running | success | failed | canceled | skipped | manual | scheduled
  web_url?: string | null;
  ref?: string | null;
}

function checkRunState(run: RawCheckRun): CheckState {
  // Tant que le run n'est pas `completed`, il n'a pas de conclusion : en cours.
  if (run.status !== "completed") return "pending";
  switch (run.conclusion) {
    case "success":
      return "success";
    case "neutral":
    case "skipped":
      return "neutral";
    default:
      // `failure`, `cancelled`, `timed_out`, `action_required`, `stale`, et une
      // conclusion inconnue : rien de tout cela n'est un succès, et un état
      // inventé par GitHub demain ne doit pas passer pour vert.
      return "failure";
  }
}

function commitStatusState(status: RawCommitStatus): CheckState {
  switch (status.state) {
    case "success":
      return "success";
    case "pending":
      return "pending";
    default:
      // `failure` et `error`.
      return "failure";
  }
}

function pipelineState(status: string | undefined): CheckState {
  switch (status) {
    case "success":
      return "success";
    case "skipped":
    case "manual":
      // Un job manuel non déclenché n'est pas un échec : il attend une décision
      // humaine que minddy ne prend pas.
      return "neutral";
    case "failed":
    case "canceled":
      return "failure";
    default:
      // created / waiting_for_resource / preparing / pending / running / scheduled.
      return "pending";
  }
}

function summarize(checks: PullRequestCheck[]): ChecksSummary {
  const sorted = [...checks].sort(
    (a, b) => SEVERITY[a.state] - SEVERITY[b.state] || a.name.localeCompare(b.name),
  );
  const state: CheckState | null = sorted.some((c) => c.state === "failure")
    ? "failure"
    : sorted.some((c) => c.state === "pending")
      ? "pending"
      : sorted.length > 0
        ? "success"
        : null;
  return {
    checks: sorted,
    state,
    // Neutre compte comme non bloquant : « 5/5 » sur une CI dont deux jobs sont
    // sautés dit la vérité, « 3/5 » ferait croire à deux échecs.
    passing: sorted.filter((c) => c.state === "success" || c.state === "neutral").length,
    total: sorted.length,
  };
}

/**
 * GitHub : fusionne les check runs (GitHub Actions & co) et les commit statuses
 * (l'API historique, encore utilisée par beaucoup d'intégrations). Un même nom
 * peut arriver des deux côtés — le check run gagne, il porte l'état le plus
 * détaillé et c'est lui que GitHub affiche.
 */
export function summarizeGithubChecks(
  runs: RawCheckRun[],
  statuses: RawCommitStatus[],
): ChecksSummary {
  const byName = new Map<string, PullRequestCheck>();
  for (const s of statuses) {
    const name = s.context?.trim();
    if (!name) continue;
    byName.set(name, { name, state: commitStatusState(s), url: s.target_url ?? null });
  }
  for (const r of runs) {
    const name = r.name?.trim();
    if (!name) continue;
    byName.set(name, {
      name,
      state: checkRunState(r),
      url: r.html_url ?? r.details_url ?? null,
    });
  }
  return summarize([...byName.values()]);
}

/**
 * GitLab : une MR porte une LISTE de pipelines, du plus récent au plus ancien,
 * et seul le dernier par ref décrit l'état courant — garder les précédents
 * ferait traîner indéfiniment l'échec d'un push déjà corrigé. Le nom affiché est
 * le numéro de pipeline : GitLab n'expose pas ici le détail par job (il faudrait
 * un appel par pipeline, pour une vue que minddy ne déplie pas).
 */
export function summarizeGitlabPipelines(pipelines: RawPipeline[]): ChecksSummary {
  const latest = pipelines[0];
  if (!latest?.id) return summarize([]);
  return summarize([
    {
      name: `#${latest.id}`,
      state: pipelineState(latest.status),
      url: latest.web_url ?? null,
    },
  ]);
}
