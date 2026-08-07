import { AGENT_SOFT_DEADLINE_MS } from "@/lib/agent-models";

/**
 * Arithmétique du budget d'un chunk (MIN-213). PUR et testable — comme
 * `command-guard.ts` ou `deployment.ts` : la politique ici, les mains dans
 * `drain.ts` (qui admet) et `execute.ts` (qui dépense).
 *
 * Le chunk et le drain parlent du MÊME temps, et ils en parlaient chacun de leur
 * côté. `MIN_CHUNK_BUDGET_MS` valait 40 s, posé à la main dans `drain.ts` ; le
 * plancher que le chunk s'accorde une fois démarré en vaut 45 (`MIN_SOFT_DEADLINE_MS`
 * + `COMMIT_MARGIN_MS`), et ce plancher-là ne compte PAS l'amorçage — réveil de la
 * microVM et clone du dépôt, qui n'est borné par rien. Le drain admettait donc des
 * chunks qui ne pouvaient pas tenir, et la fonction se faisait tuer en plein travail :
 * le run restait `running` vingt minutes (`STUCK_RUNNING_MS`) sans un event, et deux
 * débordements de suite épuisaient `MAX_CRASH_ATTEMPTS` — la conversation effacée.
 *
 * D'où ce module : le seuil d'admission ne se POSE plus, il se DÉRIVE. Les deux
 * chiffres ne peuvent plus diverger en silence, parce qu'il n'y a plus qu'un chiffre.
 */

/** Marge (ms) réservée après la boucle pour commit+push+PR+stamp. */
export const COMMIT_MARGIN_MS = 25_000;

/** Soft-deadline plancher d'un chunk (si le budget restant est très court). */
export const MIN_SOFT_DEADLINE_MS = 20_000;

/**
 * Ce qu'un chunk s'accorde AU MINIMUM une fois la microVM réveillée : de quoi jouer
 * un round au plancher, puis commiter et pousser. En dessous, le tour ne peut pas
 * finir — et un tour qui ne finit pas ne laisse pas de checkpoint.
 */
export const CHUNK_FLOOR_MS = MIN_SOFT_DEADLINE_MS + COMMIT_MARGIN_MS;

/**
 * Indemnité d'AMORÇAGE à froid : réveil de la microVM (ou création + clone du dépôt),
 * plus la résolution du token de forge et le chargement du contexte du run. Rien de
 * tout ça n'est borné côté minddy — le clone lui-même a 180 s de timeout dans
 * `sandbox.ts` — donc ce chiffre est une MOYENNE généreuse, pas une garantie.
 *
 * C'est bien pour ça qu'`executeAgentRun` relit le budget une fois la sandbox debout :
 * ce qui déborde de l'indemnité se rattrape là, par un re-queue propre sur une microVM
 * déjà chaude. Ici, on évite juste de claim un run qu'on sait ne pas pouvoir servir.
 */
export const COLD_SETUP_ALLOWANCE_MS = 60_000;

/**
 * En dessous, le drain ne DÉMARRE pas un chunk : ce qu'il faut au chunk pour tenir
 * son plancher, plus l'amorçage qu'il paiera avant même d'y arriver.
 */
export const MIN_CHUNK_BUDGET_MS = CHUNK_FLOOR_MS + COLD_SETUP_ALLOWANCE_MS;

/**
 * Soft-deadline d'un chunk : ce que le drain lui donne, moins l'amorçage déjà
 * consommé et la marge de fin de tour, borné par la config.
 *
 * UNE fonction pour deux appelants : l'ADMISSION la projette à l'entrée du chunk
 * (`elapsedMs` à zéro, l'amorçage n'a pas encore eu lieu), la boucle la calcule pour
 * de bon une fois la microVM réveillée. Deux copies de cette formule dériveraient,
 * et l'admission refuserait alors sur un autre chiffre que celui que le chunk
 * s'accorde vraiment.
 */
export function chunkSoftDeadlineMs(deadlineMs: number, elapsedMs: number): number {
  return Math.max(
    MIN_SOFT_DEADLINE_MS,
    Math.min(deadlineMs - elapsedMs - COMMIT_MARGIN_MS, AGENT_SOFT_DEADLINE_MS),
  );
}

/**
 * Ce qu'un `run_command` garde AU MINIMUM, même quand le chunk est à sec (MIN-214).
 * Un plancher, pas une réserve : en dessous, la commande n'aurait même pas le temps
 * de démarrer, et le modèle lirait un timeout là où il n'y a qu'un budget épuisé.
 * Il déborde donc la soft-deadline d'au plus ça — absorbé par `COMMIT_MARGIN_MS`.
 */
export const RUN_COMMAND_MIN_TIMEOUT_MS = 5_000;

/**
 * Timeout effectif d'un `run_command` (MIN-214) : le plafond du tool, ce que le
 * modèle a demandé, et ce qu'il RESTE au chunk — le plus petit des trois.
 *
 * La soft-deadline n'était qu'un guichet d'entrée : elle décidait si on entamait un
 * round, jamais si on avait de quoi le finir. Un round entamé juste avant pouvait
 * lancer une commande qui allait au bout de ses 180 s, et la fonction mourait avant
 * d'écrire le checkpoint — le chunk entier perdu, le run figé sur `running` vingt
 * minutes. Borner par le restant supprime le terme N × 180 s.
 *
 * Le modèle, lui, ne peut toujours que RACCOURCIR : le plancher ne s'applique qu'au
 * plafond dérivé du temps, jamais à ce qu'il a demandé.
 *
 * `ceilingMs` est passé (c'est `RUN_COMMAND_TIMEOUT_MS`, que `tools.ts` annonce au
 * modèle dans la description du tool) plutôt qu'importé : ce module ne dépend que de
 * l'arithmétique du budget, et l'importer ferait entrer tout le schéma des tools ici.
 */
export function runCommandTimeoutMs(
  askedMs: number | null | undefined,
  remainingMs: number,
  ceilingMs: number,
): number {
  const cap = Math.max(RUN_COMMAND_MIN_TIMEOUT_MS, Math.min(ceilingMs, remainingMs));
  return askedMs != null && askedMs > 0 ? Math.min(Math.floor(askedMs), cap) : cap;
}
