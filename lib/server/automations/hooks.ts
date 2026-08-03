import "server-only";

import type { AgentRun } from "@/lib/server/agent/runs";
import type { AutomationEvent, AutomationSource } from "@/lib/automations";
import type { IssueStatus } from "@/lib/issue-constants";
import { afterOrNow } from "@/lib/server/after-safe";

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
 * Retient l'invocation AVANT le premier `await`.
 *
 * C'était le défaut commun des trois crochets : ils faisaient `void go()`, et
 * `go` n'entrait dans `after()` qu'après deux aller-retours de base. Entre les
 * deux, rien ne retenait la fonction — une promesse flottante n'est pas
 * `waitUntil`-ée, et le contrat de la plateforme ne la garantit pas. Ce qui se
 * perdait là n'était pas cosmétique : l'avancement d'une chaîne, ou son arrêt
 * demandé par un humain. Et comme rien ne rattrape une chaîne `running`, chaque
 * perte coûtait un ticket verrouillé, pas un raté rejouable.
 */
function inBackground(work: () => Promise<void>, label: string): void {
  afterOrNow(() =>
    work().catch((e) => console.error(`[automations] ${label} failed:`, (e as Error).message)),
  );
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
  /**
   * QUI a fait l'écriture. Sans elle, une règle ne peut pas distinguer « je
   * déplace une carte » de « mon agent MCP range son ticket » — et les
   * préréglages qui écrivent du code ne partent que du premier.
   */
  source: AutomationSource;
}): void {
  void schedule({
    issueId: params.issueId,
    projectId: params.projectId,
    event: {
      type: "status_changed",
      from: params.from,
      to: params.to,
      source: params.source,
    },
  }).catch((e) => console.error("[automations] status hook failed:", (e as Error).message));
}

/**
 * QUELQU'UN A PRIS LA MAIN sur le ticket — annule sa chaîne EN SURSIS.
 *
 * Le sursis se juge d'habitude au statut : si le ticket a bougé, la chaîne
 * n'a plus lieu d'être. Mais la moitié des gestes manuels ne déplacent RIEN :
 *
 *   • lancer « générer un plan », « vérifier le plan », « vérifier
 *     l'implémentation » ou une consigne libre — seul `implement` démarre le
 *     ticket (`intentStartsWork`), les trois autres le laissent où il est ;
 *   • copier le prompt de plan, de vérification ou une consigne libre — seul
 *     le prompt d'implémentation avance le ticket (`shouldAutoStartOnPromptCopy`),
 *     « planifier n'est pas commencer le travail ».
 *
 * Dans tous ces cas, le ticket reste en « à faire » et le sursis courait
 * jusqu'au bout : Numo repartait sur un travail qu'on venait de prendre en
 * charge. Ce point d'appel-ci le dit explicitement, pour les cinq façons de
 * lancer comme pour les quatre façons de copier.
 *
 * ANNULATION SILENCIEUSE : la chaîne n'a rien joué, rien dépensé. Best-effort,
 * et strictement limité au sursis — une chaîne qui TOURNE n'est pas concernée,
 * c'est le refus `alreadyRunning` qui arbitre ce cas-là.
 */
export function handOffToHuman(issueId: string): void {
  inBackground(async () => {
    const { chainForIssue, cancelPendingChain } = await import("./chain");
    const chain = await chainForIssue(issueId);
    if (chain?.status === "pending") await cancelPendingChain(chain.id, "taken_over");
  }, "hand-off hook");
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
  inBackground(async () => {
    const { recomputeChainSpend } = await import("./chain");
    // Recalcul, pas cumul : un run traverse plusieurs repos et `cost_usd` est
    // cumulatif — additionner le total à chaque passage le comptait plusieurs fois.
    await recomputeChainSpend(run.chain_id as string);
    // L'agent a posé une QUESTION (`ask_user`) et attend la réponse. Son TOUR
    // s'est bien terminé — d'où le statut `completed` qui nous amène ici — mais
    // son TRAVAIL, non. Enchaîner maintenant lancerait l'étape suivante par
    // dessus une question restée sans réponse, et la question partirait avec le
    // run. On cumule la dépense et on s'arrête là : la réponse remet le run en
    // file (`queued`, non terminal), et c'est sa PROCHAINE fin — celle qui
    // n'attend plus rien — qui fera avancer la chaîne.
    if (run.awaiting_input) return;
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
  }, "run-end hook");
}

/**
 * Un « stop » HUMAIN sur un run de chaîne ARRÊTE la chaîne — il ne la fait pas
 * avancer. Le bouton d'interruption est le geste de quelqu'un qui veut que ça
 * cesse, pas une fin d'étape. C'est ici qu'il faut le dire : le crochet de fin de
 * run ne peut pas le déduire, `clearInterrupt` ayant déjà effacé le drapeau
 * quand `stampRun` s'exécute.
 */
export function stopChainOnInterrupt(chainId: string): void {
  inBackground(async () => {
    const { getChain } = await import("./chain");
    const { haltChain } = await import("./report");
    const chain = await getChain(chainId);
    if (chain) await haltChain(chain, "interrupted");
  }, "interrupt hook");
}
