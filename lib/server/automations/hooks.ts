import "server-only";

import type { AgentRun } from "@/lib/server/agent/runs";
import type { AutomationEvent } from "@/lib/automations";
import type { IssueStatus } from "@/lib/issue-constants";

/**
 * Les CROCHETS des automatisations (MIN-147) — les deux seuls endroits d'où la
 * boucle apprend que quelque chose s'est passé : un changement de statut, et la
 * fin d'un run.
 *
 * Ce module existe pour une raison précise : `update-issue.ts` et `runs.ts` ont
 * besoin d'appeler le moteur, et le moteur les rappelle tous les deux (une
 * action `set_status` repasse par `updateIssueFields`, une étape lance un run).
 * Un import statique croisé formerait un cycle à l'INITIALISATION des modules.
 * Le moteur est donc chargé À L'APPEL (`await import`), et les deux appelants ne
 * connaissent que ce fichier-ci, qui n'importe rien de lourd.
 *
 * Tout y est best-effort : une automatisation qui échoue ne doit jamais faire
 * échouer l'écriture ou le run qui l'a déclenchée.
 */

interface ScheduleParams {
  issueId: string;
  projectId: string;
  event: AutomationEvent;
  chainId?: string | null;
}

async function schedule(params: ScheduleParams): Promise<void> {
  const { scheduleAutomations } = await import("./engine");
  scheduleAutomations(params);
}

/**
 * Un ticket a VRAIMENT changé de statut. Appelé depuis `updateIssueFields`, hors
 * chemin critique, et no-op silencieux si le monde a bougé — même contrat que
 * ses voisins `scheduleSmartAssign` / `scheduleFeedbackStatusSync`.
 *
 * Attention à la boucle : l'action `set_status` d'une règle repasse par
 * `updateIssueFields` et redéclenche donc ce crochet. Ce sont `played_rule_ids`
 * et `MAX_CHAIN_STEPS` qui l'arrêtent, pas ce point d'appel.
 */
export function scheduleStatusAutomations(params: {
  issueId: string;
  projectId: string;
  from: IssueStatus | null;
  to: IssueStatus;
}): void {
  void schedule({
    issueId: params.issueId,
    projectId: params.projectId,
    event: { type: "status_changed", from: params.from, to: params.to },
  }).catch((e) => console.error("[automations] status hook failed:", (e as Error).message));
}

/** Statuts de run que la chaîne lit comme un succès. */
const OK_STATUSES = new Set(["completed"]);

/**
 * UN RUN DE CHAÎNE VIENT DE FINIR. Appelé depuis `stampRun` — le passage OBLIGÉ
 * vers un statut terminal, dont la garde `.in("status", guard)` assure qu'une
 * seule mise à jour gagne : donc un seul avancement de chaîne, même si deux
 * chunks tentent de conclure. Les huit chemins de repos d'`execute.ts` y
 * convergent tous, et le re-queue de steering (`queued`, non terminal) en est
 * exclu d'office.
 *
 * La dépense du run est CUMULÉE sur la chaîne avant de réévaluer les règles :
 * c'est ce qui rend le plafond par chaîne exécutoire à l'étape suivante.
 */
export function notifyChainOfRunEnd(run: AgentRun): void {
  if (!run.chain_id || !run.issue_id) return;
  const go = async () => {
    const { addChainSpend } = await import("./chain");
    await addChainSpend(run.chain_id as string, Number(run.cost_usd ?? 0));
    await schedule({
      issueId: run.issue_id as string,
      projectId: run.project_id,
      chainId: run.chain_id,
      event: {
        type: "run_finished",
        intent: run.intent ?? "implement",
        outcome: OK_STATUSES.has(run.status) ? "ok" : "failed",
      },
    });
  };
  void go().catch((e) =>
    console.error("[automations] run-end hook failed:", (e as Error).message),
  );
}

/**
 * Un « stop » HUMAIN sur un run de chaîne ARRÊTE la chaîne — il ne la fait pas
 * avancer. Le bouton d'interruption est le geste de quelqu'un qui veut que ça
 * cesse, pas une fin d'étape. C'est ici qu'il faut le dire : le crochet de fin de
 * run ne peut pas le déduire, `clearInterrupt` ayant déjà effacé le drapeau
 * quand `stampRun` s'exécute.
 */
export function stopChainOnInterrupt(chainId: string): void {
  const go = async () => {
    const { getChain } = await import("./chain");
    const { haltChain } = await import("./report");
    const chain = await getChain(chainId);
    if (chain) await haltChain(chain, "interrupted");
  };
  void go().catch((e) =>
    console.error("[automations] interrupt hook failed:", (e as Error).message),
  );
}
