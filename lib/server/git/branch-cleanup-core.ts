// Sélection PURE des branches d'agent (MIN-102), sans DB ni import server-only :
// testable en node/vitest, comme issue-sync-core.ts. La partie qui interroge la
// base et la forge vit dans branch-cleanup.ts.
//
// La liste montre TOUTES les branches que minddy a poussées et qui existent
// encore sur le dépôt — pas seulement celles dont la PR est fermée. Une session
// d'agent en attente, ou qui a poussé sans jamais ouvrir de PR, a elle aussi une
// branche, et on ne peut pas la gérer sans la voir. Ce qui protège n'est donc
// plus l'absence de la ligne mais son ÉTAT : seules les branches fusionnées
// arrivent cochées, le reste demande un geste et un avertissement.
//
// Deux verrous d'appartenance, et il faut les deux : la branche doit être connue
// de `agent_runs` (preuve que minddy l'a créée) ET porter le préfixe d'agent
// (defense in depth, au cas où une ligne de `agent_runs` pointerait une branche
// saisie à la main).

import type { PullRequestRef } from "@/lib/server/agent/pr";

/** Préfixe des branches poussées par l'agent (cf. `execute.ts`, `workBranch`). */
export const AGENT_BRANCH_PREFIX = "minddy/agent/";

/**
 * État d'une branche d'agent, par ordre de sûreté décroissante :
 *   • `merged` — sa PR est fusionnée : le travail est livré, rien à perdre ;
 *   • `closed` — sa PR a été refusée : le travail n'existe QUE là ;
 *   • `open`   — sa PR est ouverte ou en brouillon : une session travaille ;
 *   • `none`   — aucune PR : branche fraîchement créée, ou session au repos.
 */
export type AgentBranchState = "merged" | "closed" | "open" | "none";

/** `open` et `none` = une session d'agent peut encore s'en servir. */
export function isBranchInUse(state: AgentBranchState): boolean {
  return state === "open" || state === "none";
}

/** Une branche d'agent du dépôt, avec la PR qui la qualifie s'il y en a une. */
export interface AgentBranch {
  branch: string;
  state: AgentBranchState;
  /** Null quand `state` vaut `none` : il n'y a aucune PR à référencer. */
  prNumber: number | null;
  prUrl: string | null;
  /** Date de la PR retenue (ISO), pour le tri. Null sans PR. */
  prCreatedAt: string | null;
}

/**
 * Garde-fou de suppression : la branche est-elle une branche d'agent qu'on peut
 * effacer sans réfléchir ? Vrai seulement si elle porte le préfixe, n'est pas la
 * branche par défaut du dépôt, et ne contient rien qui puisse sortir du ref
 * attendu (`..`, espace) une fois interpolée dans l'URL de l'API.
 */
export function isDeletableAgentBranch(branch: string, defaultBranch: string): boolean {
  if (!branch.startsWith(AGENT_BRANCH_PREFIX)) return false;
  if (branch.length === AGENT_BRANCH_PREFIX.length) return false;
  if (branch === defaultBranch) return false;
  if (branch.includes("..") || /\s/.test(branch)) return false;
  return true;
}

/** Une PR est-elle encore vivante (ouverte ou brouillon) ? */
function isLive(pr: PullRequestRef): boolean {
  return pr.state === "open" || pr.draft === true;
}

/** Comparateur de fraîcheur : la PR la plus récemment ouverte gagne. */
function newerThan(a: string | null, b: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return a > b;
}

/** Ordre d'affichage : du plus sûr à supprimer au plus risqué. */
const STATE_ORDER: Record<AgentBranchState, number> = {
  merged: 0,
  closed: 1,
  open: 2,
  none: 3,
};

/**
 * Croise trois sources et rend les branches d'agent gérables :
 *   • `knownBranches` — ce que les runs du projet ont enregistré (appartenance),
 *     dans l'ordre d'itération de l'appelant (run le plus récent d'abord), qui
 *     départage les branches sans PR, faute de date à comparer ;
 *   • `remoteBranches` — ce qui existe VRAIMENT sur le dépôt. Sans ce filtre, la
 *     liste ressusciterait toutes les branches jamais créées, dont l'immense
 *     majorité a déjà été supprimée ;
 *   • `pulls` — ce qui donne son état à chaque branche.
 *
 * Une PR vivante l'emporte toujours sur une PR fermée de la même branche (cas
 * d'une PR rouverte) : la branche est alors `open`, jamais proposée cochée.
 */
export function selectAgentBranches(opts: {
  pulls: PullRequestRef[];
  knownBranches: Iterable<string>;
  remoteBranches: Set<string> | ReadonlySet<string>;
  defaultBranch: string;
}): AgentBranch[] {
  const { pulls, knownBranches, remoteBranches, defaultBranch } = opts;

  // Meilleure PR vivante et meilleure PR fermée de chaque branche, en une passe.
  const live = new Map<string, PullRequestRef>();
  const dead = new Map<string, PullRequestRef>();
  for (const pr of pulls) {
    const branch = pr.head;
    if (!branch) continue;
    const bucket = isLive(pr) ? live : dead;
    const current = bucket.get(branch);
    if (!current || newerThan(pr.createdAt ?? null, current.createdAt ?? null)) {
      bucket.set(branch, pr);
    }
  }

  const seen = new Set<string>();
  const branches: AgentBranch[] = [];
  for (const branch of knownBranches) {
    if (seen.has(branch)) continue;
    seen.add(branch);
    if (!remoteBranches.has(branch)) continue;
    if (!isDeletableAgentBranch(branch, defaultBranch)) continue;

    const livePr = live.get(branch);
    const deadPr = livePr ? undefined : dead.get(branch);
    const pr = livePr ?? deadPr ?? null;
    const state: AgentBranchState = livePr
      ? "open"
      : deadPr
        ? deadPr.merged
          ? "merged"
          : "closed"
        : "none";

    branches.push({
      branch,
      state,
      prNumber: pr?.number ?? null,
      prUrl: pr?.url ?? null,
      prCreatedAt: pr?.createdAt ?? null,
    });
  }

  // Tri stable : par état (les fusionnées d'abord, elles seront pré-cochées),
  // puis par PR la plus récente. Les branches sans PR gardent l'ordre reçu.
  return branches
    .map((b, index) => ({ b, index }))
    .sort((x, y) => {
      const byState = STATE_ORDER[x.b.state] - STATE_ORDER[y.b.state];
      if (byState !== 0) return byState;
      const byDate = (y.b.prCreatedAt ?? "").localeCompare(x.b.prCreatedAt ?? "");
      return byDate !== 0 ? byDate : x.index - y.index;
    })
    .map(({ b }) => b);
}
