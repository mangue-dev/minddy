/**
 * La relecture d'une PR par Numo vue comme une SESSION D'AGENT (MIN-168) — le
 * vocabulaire partagé entre le serveur qui la lance (`lib/server/agent/launch.ts`)
 * et l'écran qui l'affiche (`components/pull-requests/pr-review-thread.tsx`).
 *
 * Module PUR : aucun import serveur, il traverse la frontière.
 *
 * Ce qui a disparu par rapport à l'ancienne passe (`lib/pr-review-run.ts`) : le
 * flux d'événements maison, ses phases, ses `finding`, son direct. Une relecture
 * est maintenant un run d'agent comme un autre — son déroulé est celui de
 * `agent_run_events`, et il se regarde dans la session, pas dans le fil de la PR.
 * Ne reste ici que ce dont le fil de la PR a besoin : dire que l'agent travaille
 * ou qu'il a fini, et ouvrir la session.
 */

export type PrReviewRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

/** La session de relecture, réduite à ce que le fil de la PR en montre. */
export interface PrReviewRunSummary {
  runId: string;
  status: PrReviewRunStatus;
  /** L'agent TRAVAILLE (queued/running) — le serveur tranche, pas l'écran. */
  working: boolean;
  model: string | null;
  createdAt: string;
  /** Fin de la dernière réponse, ou null tant qu'il n'y en a pas eu. */
  completedAt: string | null;
}

/** Réponse du GET `./ai-review` : la session, et de quoi décider d'en relancer une. */
export interface PrReviewSession {
  run: PrReviewRunSummary | null;
  /** SHA relu par la dernière session TERMINÉE — comparé à la tête courante :
   *  tant qu'ils sont égaux, relancer repaierait un run pour le même code. */
  reviewedHeadSha: string | null;
  model: {
    /** Défaut réglé en /admin : ce que vaut « défaut » dans le picker. */
    instance: string;
    /** Dernier choix du compte, ou null s'il n'en a jamais fait. */
    preferred: string | null;
  };
}
