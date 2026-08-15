import { getDesktopBridge } from "@/lib/desktop/bridge";

/**
 * DIRE À LA COQUILLE DE JOUER CE TOUR ICI (MIN-293) — le maillon qui manquait.
 *
 * ## Ce qui s'est passé sans lui, et pourquoi ça ne se voyait pas
 *
 * Le sélecteur d'environnement écrit bien `agent_runs.local_exec = true`, le
 * drain laisse désormais ce run tranquille, et le lanceur sait le jouer. Mais
 * **rien n'appelait le lanceur** : le run restait `queued` sans que personne le
 * réclame, ou — pire, avec un serveur qui n'avait pas encore la garde du drain —
 * il partait dans une microVM. Dans les deux cas l'utilisateur a demandé sa
 * machine et n'a rien obtenu de tel, **sans qu'aucun message ne le dise**. C'est
 * exactement le défaut que ce chantier combat partout ailleurs.
 *
 * Le symptôme se lit à l'envers, et il est net : un agent qui ne trouve ni un
 * fichier gitignoré ni un `test.txt` non commité n'est pas dans ton dépôt — il
 * est dans un clone frais.
 *
 * ## Pourquoi c'est la PAGE qui déclenche, et pourquoi ça ne durera pas
 *
 * C'est le raccourci, et il est assumé : la page vient de lancer ce run, elle en
 * connaît l'identifiant, elle est dans la fenêtre. **MIN-294 renversera le sens**
 * — la coquille RÉCLAMERA (« j'ai du temps, as-tu du travail ? »), ce qui retire
 * complètement le renderer de la boucle, fait marcher les runs lancés depuis un
 * autre appareil, et permet la présence et le repli.
 *
 * D'ici là, la coquille **refuse ce membre dans l'app empaquetée**
 * ([bridge.ts](desktop/bridge.ts)) : le renderer charge du code distant, et lui
 * laisser déclencher un fork de harness est un élargissement du pont qu'on ne
 * fait pas pour un raccourci temporaire. Le tour local se teste donc avec
 * `npm run desktop:dev`.
 *
 * ## Le refus se DIT, toujours
 *
 * Un tour local qui ne part pas est la panne la plus silencieuse du chantier :
 * la conversation s'ouvre, le fil attend, et rien n'arrive. La fonction rend donc
 * toujours un message, et l'appelant l'affiche.
 */

export type LocalRunHereResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/**
 * Ce texte n'est PAS traduit, et c'est délibéré : il ne sort que dans la coquille
 * de développement, il disparaîtra avec MIN-294, et les phrases qu'il relaie
 * viennent du lanceur — qui écrit en anglais, comme le menu natif et le rapport
 * de diagnostic. Inventer deux clés i18n pour une surface qui a une date de
 * péremption reviendrait à les laisser derrière soi.
 */
const NO_BRIDGE =
  "This conversation runs on your Mac, but nothing here can start it: open it from the minddy desktop app.";

/**
 * Joue le tour de `runId` sur cette machine.
 *
 * `local` est ce que la LIGNE du run dit, jamais ce que le composer a demandé :
 * le serveur revalide la demande (`localExecRequested`), et un run refusé pour sa
 * nature — ancrage `pr`, routine, chaîne, mention — repart dans le cloud. Suivre
 * la demande ferait attendre la machine sur un tour qui n'arrivera jamais.
 */
export async function playLocalRunHere(
  runId: string,
  local: boolean | undefined,
): Promise<LocalRunHereResult | null> {
  // `null` = ce run n'est pas local, il n'y a rien à faire et rien à dire.
  if (local !== true) return null;

  const bridge = getDesktopBridge();
  if (!bridge?.startLocalRun) return { ok: false, message: NO_BRIDGE };

  try {
    const started = await bridge.startLocalRun({ runId });
    // `skipped` = le tour tourne déjà ici, et le message qu'on vient d'envoyer
    // sera pris par la boucle en vol. Il n'y a rien à lancer, donc rien à dire.
    if (started.status === "started" || started.status === "skipped") return { ok: true };
    return { ok: false, message: started.message || `Local run refused: ${started.reason}` };
  } catch (error) {
    // Un `invoke` qui lève, c'est un main process qui n'a pas le handler — donc
    // une coquille plus ancienne que cette page. Le dire vaut mieux que le silence.
    return {
      ok: false,
      message: `The minddy app could not start this turn: ${(error as Error).message}`,
    };
  }
}
