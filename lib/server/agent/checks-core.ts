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
  /** L'intégration qui a produit le check — « GitHub Actions », « Socket
      Security »… `null` quand le NOM du check la porte déjà (les commit statuses
      s'appellent « Vercel – ui »). */
  appName: string | null;
  /** Son logo, servi par la forge. `null` = pas de logo à afficher (GitLab n'en
      expose aucun) : l'UI retombe sur l'icône de la forge. */
  appAvatarUrl: string | null;
  /** Le résultat en une ligne, tel que la forge le formule (« Deployment has
      completed »). Vide pour la plupart des jobs GitHub Actions : eux ne se
      racontent que par leur état et leur durée. */
  description: string | null;
  /** Durée mesurée, quand la forge donne les deux bornes. */
  durationMs: number | null;
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

/** L'App GitHub derrière un check run (GitHub Actions, Vercel, Socket Security…). */
export interface RawCheckApp {
  id?: number;
  slug?: string;
  name?: string;
  owner?: { avatar_url?: string | null } | null;
}

/** Check run GitHub (`GET /commits/{sha}/check-runs`, `filter=latest` par défaut). */
export interface RawCheckRun {
  name?: string;
  status?: string; // queued | in_progress | completed | waiting | requested | pending
  conclusion?: string | null; // success | failure | neutral | cancelled | timed_out | action_required | skipped | stale
  html_url?: string | null;
  details_url?: string | null;
  app?: RawCheckApp | null;
  /** Le résultat tel que l'App le formule. `title` est vide sur les jobs GitHub
      Actions, rempli par les intégrations qui ont quelque chose à dire. */
  output?: { title?: string | null } | null;
  started_at?: string | null;
  completed_at?: string | null;
}

/** Commit status GitHub (`GET /commits/{sha}/status`). */
export interface RawCommitStatus {
  context?: string;
  state?: string; // pending | success | failure | error
  target_url?: string | null;
  description?: string | null;
  /** Logo de l'intégration, déjà servi par GitHub sous sa forme canonique
      (`https://avatars.githubusercontent.com/in/{app_id}` — mesuré). */
  avatar_url?: string | null;
  creator?: { avatar_url?: string | null } | null;
}

/** Pipeline GitLab (`GET /merge_requests/:iid/pipelines`). */
export interface RawPipeline {
  id?: number;
  status?: string; // created | waiting_for_resource | preparing | pending | running | success | failed | canceled | skipped | manual | scheduled
  web_url?: string | null;
  ref?: string | null;
  /** Nom du pipeline quand le projet en donne un (`workflow:name`). */
  name?: string | null;
}

/** Marque du CI de GitLab — un nom propre, donc jamais traduit. */
const GITLAB_CI_APP = "GitLab CI/CD";

/**
 * Logo d'une App GitHub. Ce n'est PAS `app.owner.avatar_url` : celui-là est
 * l'avatar du COMPTE propriétaire (l'organisation `github` pour GitHub Actions,
 * donc l'octocat au lieu du logo Actions). Le logo de l'App vit sous `/in/{id}`,
 * et c'est exactement l'URL que GitHub sert lui-même dans l'`avatar_url` des
 * commit statuses (mesuré : `in/8329` pour Vercel). `s=48` parce qu'on l'affiche
 * en 20 px : sans lui, GitHub renvoie l'original en 460 px.
 */
function githubAppAvatar(app: RawCheckApp | null | undefined): string | null {
  if (app?.id) return `https://avatars.githubusercontent.com/in/${app.id}?s=48`;
  return app?.owner?.avatar_url ?? null;
}

/**
 * Durée entre deux bornes ISO. `null` dès que l'une manque ou que l'écart n'est
 * pas positif : GitHub date un job sauté avec un `completed_at` ANTÉRIEUR à son
 * `started_at` (mesuré), et « 0 s » ne dit rien de plus que rien.
 */
function elapsedMs(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** Chaîne non vide, débarrassée de ses espaces — sinon `null`. */
function text(value: string | null | undefined): string | null {
  return value?.trim() || null;
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
    const name = text(s.context);
    if (!name) continue;
    byName.set(name, {
      name,
      state: commitStatusState(s),
      url: s.target_url ?? null,
      // Le contexte d'un status NOMME déjà son intégration (« Vercel – ui ») :
      // répéter le login du bot qui l'a posé (« vercel[bot] ») n'ajoute rien.
      appName: null,
      appAvatarUrl: s.avatar_url ?? s.creator?.avatar_url ?? null,
      description: text(s.description),
      // L'API historique ne date que la pose du status, pas le travail derrière.
      durationMs: null,
    });
  }
  for (const r of runs) {
    const name = text(r.name);
    if (!name) continue;
    byName.set(name, {
      name,
      state: checkRunState(r),
      url: r.html_url ?? r.details_url ?? null,
      appName: text(r.app?.name),
      appAvatarUrl: githubAppAvatar(r.app),
      description: text(r.output?.title),
      durationMs: elapsedMs(r.started_at, r.completed_at),
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
 *
 * Aucun logo par intégration de ce côté — chez GitLab, le CI EST GitLab : l'UI
 * retombe sur l'icône de la forge. Aucune durée non plus : cette liste ne donne
 * que `created_at`/`updated_at`, et leur écart n'est pas la durée du pipeline
 * (une relance le rallonge après coup).
 */
export function summarizeGitlabPipelines(pipelines: RawPipeline[]): ChecksSummary {
  const latest = pipelines[0];
  if (!latest?.id) return summarize([]);
  return summarize([
    {
      name: `#${latest.id}`,
      state: pipelineState(latest.status),
      url: latest.web_url ?? null,
      appName: GITLAB_CI_APP,
      appAvatarUrl: null,
      // À défaut d'un résultat en une ligne, ce que le pipeline a fait tourner :
      // son nom quand le projet en donne un, sinon la branche.
      description: text(latest.name) ?? text(latest.ref),
      durationMs: null,
    },
  ]);
}
