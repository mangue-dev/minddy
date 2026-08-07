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
