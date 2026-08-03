import "server-only";

import { after } from "next/server";

/**
 * `after()` qui ne LÈVE pas hors d'une requête.
 *
 * Les travaux de fond de minddy (Smart Assign, capture de cycle, synchro du
 * feedback, automatisations) sont programmés depuis `updateIssueFields`, et
 * `after()` exige un contexte de requête. Tant que ce cœur d'écriture n'était
 * appelé que par des routes, la question ne se posait pas.
 *
 * MIN-147 l'a changée : le moteur d'automatisations écrit sur le ticket depuis
 * une CASCADE — une chaîne dont l'étape se termine en rappelle une autre, hors
 * de toute requête — et par `launchAgentRun`, qui aligne le statut au démarrage
 * d'un run. Là, `after()` lève ; et comme il lève AVANT le crochet suivant, il
 * emportait avec lui tout ce qui restait à programmer, plus l'écriture elle-même.
 *
 * Le repli exécute le travail TOUT DE SUITE plutôt qu'après la réponse : sans
 * requête, il n'y a pas de réponse à attendre. Le contrat des appelants est
 * inchangé — hors chemin critique, best-effort, jamais de throw vers l'appelant.
 */
export function afterOrNow(work: () => void | Promise<void>): void {
  const run = () => {
    try {
      const result = work();
      if (result instanceof Promise) {
        void result.catch((e) =>
          console.error("[after-safe] background work failed:", (e as Error).message),
        );
      }
    } catch (e) {
      console.error("[after-safe] background work threw:", (e as Error).message);
    }
  };
  try {
    after(run);
  } catch {
    // Hors contexte de requête : on fait le travail maintenant.
    run();
  }
}
