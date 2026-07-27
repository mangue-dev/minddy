// Sélection PURE des branches d'agent à nettoyer (MIN-102), sans DB ni import
// server-only : testable en node/vitest, comme issue-sync-core.ts. La partie qui
// interroge la base et la forge vit dans branch-cleanup.ts.
//
// Le ménage vise UNE chose : les branches poussées par un run de l'agent dont la
// PR/MR est fermée (fusionnée ou refusée). Deux verrous indépendants, et il faut
// les deux : la branche doit être connue de `agent_runs` (c'est la preuve que
// minddy l'a créée) ET porter le préfixe d'agent (defense in depth, au cas où
// une ligne de `agent_runs` pointerait une branche saisie à la main).

import type { PullRequestRef } from "@/lib/server/agent/pr";

/** Préfixe des branches poussées par l'agent (cf. `execute.ts`, `workBranch`). */
export const AGENT_BRANCH_PREFIX = "minddy/agent/";

/** État de la PR d'une branche candidate — le seul axe qui change la décision. */
export type StalePrState = "merged" | "closed";

/** Une branche proposée au ménage, avec la PR qui justifie sa candidature. */
export interface StaleBranch {
  branch: string;
  prNumber: number;
  prUrl: string;
  prState: StalePrState;
  /** Date de la PR la plus récente sur cette branche (ISO), pour le tri. */
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

/** Une PR est-elle encore vivante (donc sa branche intouchable) ? */
function isLive(pr: PullRequestRef): boolean {
  return pr.state === "open" || pr.draft === true;
}

/** PR fermée → l'état qu'on montre ; une PR ouverte n'est pas une candidate. */
function staleStateOf(pr: PullRequestRef): StalePrState | null {
  if (isLive(pr)) return null;
  return pr.merged ? "merged" : "closed";
}

/** Comparateur de fraîcheur : la PR la plus récemment ouverte gagne. */
function newerThan(a: string | null, b: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return a > b;
}

/**
 * Croise les PR de la forge avec les branches réellement enregistrées par les
 * runs d'agent du projet, et rend les branches supprimables.
 *
 * Une branche est écartée si :
 *   • elle porte AUSSI une PR ouverte ou draft — le cas d'une PR rouverte, ou
 *     d'une seconde PR sur la même branche : la fermée ne dit alors plus rien ;
 *   • `isDeletableAgentBranch` la refuse (hors préfixe, branche par défaut…) ;
 *   • `agent_runs` ne la connaît pas — minddy ne touche pas au travail des
 *     humains, même s'il ressemble à celui de l'agent.
 * Une seule ligne par branche : la PR la plus récente porte l'état affiché.
 */
export function selectStaleBranches(opts: {
  pulls: PullRequestRef[];
  knownBranches: Set<string> | ReadonlySet<string>;
  defaultBranch: string;
}): StaleBranch[] {
  const { pulls, knownBranches, defaultBranch } = opts;

  // Passe 1 : les branches qu'une PR vivante protège, quoi qu'il arrive ensuite.
  const live = new Set<string>();
  for (const pr of pulls) {
    if (pr.head && isLive(pr)) live.add(pr.head);
  }

  // Passe 2 : la meilleure PR fermée de chaque branche restante.
  const byBranch = new Map<string, StaleBranch>();
  for (const pr of pulls) {
    const branch = pr.head;
    if (!branch || live.has(branch)) continue;
    if (!knownBranches.has(branch)) continue;
    if (!isDeletableAgentBranch(branch, defaultBranch)) continue;
    const prState = staleStateOf(pr);
    if (!prState) continue;

    const candidate: StaleBranch = {
      branch,
      prNumber: pr.number,
      prUrl: pr.url,
      prState,
      prCreatedAt: pr.createdAt ?? null,
    };
    const current = byBranch.get(branch);
    if (!current || newerThan(candidate.prCreatedAt, current.prCreatedAt)) {
      byBranch.set(branch, candidate);
    }
  }

  // Les fusionnées d'abord (elles seront pré-cochées), puis les plus récentes.
  return [...byBranch.values()].sort((a, b) => {
    if (a.prState !== b.prState) return a.prState === "merged" ? -1 : 1;
    return (b.prCreatedAt ?? "").localeCompare(a.prCreatedAt ?? "");
  });
}
