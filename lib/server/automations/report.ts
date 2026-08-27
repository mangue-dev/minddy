import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAccountSettings } from "@/lib/server/account-settings";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { insertNotifications } from "@/lib/server/notifications";
import { captureServerEvent } from "@/lib/server/posthog";
import { defaultLocale, type Locale } from "@/i18n/config";
import { completeChain, stopChain, type AgentChain } from "./chain";

/**
 * A channel's REPORT (MIN-147): a Numo comment on the ticket, at
 * three moments when someone should know what happened without having to
 * watch — the channel is waiting for it, it went to the end, it stopped.
 *
 * Assignment identical to `postPrComment` (execute.ts): line `comments` with
 * `author_id = chain.owner_id` and `via_assistant: true` — this is Numo speaking,
 * under the account which technically carries writing.
 *
 * The texts live HERE and not in `messages/*.json`, like the others
 * comments written by the agent: they are produced outside the request, in a
 * `after()` where `cookies()`/`headers()` no longer exist, and the language is that of
 * channel account, not that of a reader.
 *
 * NEVER DOLLARS: the expense is written as a share of the plan's monthly budget, like
 * everywhere elsewhere in the product.
 */

export type ChainReportKind = "awaiting_human" | "completed" | "stopped";

/** What the report says about a judgment, reason by reason. Unknown code falls
 * to a generic phrase rather than the raw code. */
const STOP_REASONS: Record<Locale, Record<string, string>> = {
  fr: {
    quota: "le budget d'usage IA du compte est épuisé",
    verification_failed: "la vérification de l'implémentation a échoué",
    interrupted: "quelqu'un a interrompu le run en cours",
    run_failed: "un run s'est terminé en échec",
    max_steps: "la chaîne a atteint son nombre maximum d'étapes",
    noRepo: "le projet n'a pas de dépôt lié",
    unsupportedProvider: "la forge du dépôt lié ne permet pas de faire travailler l'agent",
    alreadyRunning: "un autre run occupait déjà le ticket",
    quotaExceeded: "le budget d'usage IA du compte est épuisé",
    noModelForProvider: "aucun modèle n'est disponible pour ce fournisseur",
    modelAbovePlan: "le modèle demandé dépasse le plafond du plan",
    executionBackendUnavailable: "aucun moteur d'exécution n'est configuré sur l'instance",
    promptRequired: "l'étape n'avait pas de consigne à envoyer",
    issueNotFound: "le ticket n'existe plus",
    entitlement: "les automatisations ne sont pas incluses dans le plan du projet",
    taken_over: "quelqu'un a repris le ticket en main",
    gone: "le ticket ou le projet a été supprimé",
    expired: "elle a trop attendu pour démarrer",
    stalled: "elle s'est interrompue sans rien laisser à reprendre",
  },
  en: {
    quota: "the account's AI usage budget is spent",
    verification_failed: "the implementation failed its own check",
    interrupted: "someone interrupted the running session",
    run_failed: "a session ended in failure",
    max_steps: "the chain reached its maximum number of steps",
    noRepo: "the project has no linked repository",
    unsupportedProvider: "the linked repository's forge cannot host the agent",
    alreadyRunning: "another session was already working on the issue",
    quotaExceeded: "the account's AI usage budget is spent",
    noModelForProvider: "no model is available for this provider",
    modelAbovePlan: "the requested model is above the plan's ceiling",
    executionBackendUnavailable: "no execution backend is configured on the instance",
    promptRequired: "the step had no instruction to send",
    issueNotFound: "the issue no longer exists",
    entitlement: "automations are not included in the project's plan",
    taken_over: "someone took the issue over",
    gone: "the issue or project was deleted",
    expired: "it waited too long to start",
    stalled: "it stopped with nothing left to resume",
  },
  de: {
    quota: "das KI-Nutzungsbudget des Kontos aufgebraucht ist",
    verification_failed:
      "die Implementierung ihre eigene Prüfung nicht bestanden hat",
    interrupted: "jemand die laufende Sitzung unterbrochen hat",
    run_failed: "eine Sitzung fehlgeschlagen ist",
    max_steps: "die Kette ihre maximale Schrittzahl erreicht hat",
    noRepo: "das Projekt kein verknüpftes Repository hat",
    unsupportedProvider:
      "der Anbieter des verknüpften Repositorys den Agenten nicht unterstützt",
    alreadyRunning:
      "bereits eine andere Sitzung an diesem Ticket gearbeitet hat",
    quotaExceeded: "das KI-Nutzungsbudget des Kontos aufgebraucht ist",
    noModelForProvider: "für diesen Anbieter kein Modell verfügbar ist",
    modelAbovePlan: "das angeforderte Modell über dem Tariflimit liegt",
    executionBackendUnavailable:
      "auf dieser Instanz keine Ausführungsumgebung konfiguriert ist",
    promptRequired: "für den Schritt keine Anweisung vorlag",
    issueNotFound: "das Ticket nicht mehr existiert",
    entitlement: "Automatisierungen nicht im Projekttarif enthalten sind",
    taken_over: "jemand das Ticket übernommen hat",
    gone: "das Ticket oder Projekt gelöscht wurde",
    expired: "sie zu lange auf den Start gewartet hat",
    stalled: "sie ohne fortsetzbaren Stand angehalten hat",
  },
  "pt-BR": {
    quota: "o orçamento de uso de IA da conta acabou",
    verification_failed: "a implementação não passou na própria verificação",
    interrupted: "alguém interrompeu a sessão em andamento",
    run_failed: "uma sessão terminou com falha",
    max_steps: "a cadeia atingiu o número máximo de etapas",
    noRepo: "o projeto não tem um repositório vinculado",
    unsupportedProvider:
      "o provedor do repositório vinculado não oferece suporte ao agente",
    alreadyRunning: "outra sessão já estava trabalhando na tarefa",
    quotaExceeded: "o orçamento de uso de IA da conta acabou",
    noModelForProvider: "nenhum modelo está disponível para este provedor",
    modelAbovePlan: "o modelo solicitado ultrapassa o limite do plano",
    executionBackendUnavailable:
      "nenhum ambiente de execução está configurado na instância",
    promptRequired: "a etapa não tinha uma instrução para enviar",
    issueNotFound: "a tarefa não existe mais",
    entitlement: "as automações não estão incluídas no plano do projeto",
    taken_over: "alguém assumiu a tarefa",
    gone: "a tarefa ou o projeto foi excluído",
    expired: "ela esperou tempo demais para começar",
    stalled: "ela parou sem deixar nada para retomar",
  },
  it: {
    quota: "il budget di utilizzo dell'IA dell'account è esaurito",
    verification_failed:
      "l'implementazione non ha superato la propria verifica",
    interrupted: "qualcuno ha interrotto la sessione in corso",
    run_failed: "una sessione è terminata con un errore",
    max_steps: "la catena ha raggiunto il numero massimo di passaggi",
    noRepo: "il progetto non ha un repository collegato",
    unsupportedProvider:
      "il provider del repository collegato non supporta l'agente",
    alreadyRunning: "un'altra sessione stava già lavorando sul ticket",
    quotaExceeded: "il budget di utilizzo dell'IA dell'account è esaurito",
    noModelForProvider: "non è disponibile alcun modello per questo provider",
    modelAbovePlan: "il modello richiesto supera il limite del piano",
    executionBackendUnavailable:
      "nell'istanza non è configurato alcun ambiente di esecuzione",
    promptRequired: "il passaggio non conteneva istruzioni da inviare",
    issueNotFound: "il ticket non esiste più",
    entitlement: "le automazioni non sono incluse nel piano del progetto",
    taken_over: "qualcuno ha preso in carico il ticket",
    gone: "il ticket o il progetto è stato eliminato",
    expired: "ha atteso troppo a lungo prima di iniziare",
    stalled: "si è fermata senza lasciare nulla da riprendere",
  },
  es: {
    quota: "el presupuesto de uso de IA de la cuenta se ha agotado",
    verification_failed: "la implementación no superó su propia verificación",
    interrupted: "alguien interrumpió la sesión en curso",
    run_failed: "una sesión terminó con un error",
    max_steps: "la cadena alcanzó el número máximo de pasos",
    noRepo: "el proyecto no tiene un repositorio vinculado",
    unsupportedProvider:
      "el proveedor del repositorio vinculado no admite el agente",
    alreadyRunning: "otra sesión ya estaba trabajando en la incidencia",
    quotaExceeded: "el presupuesto de uso de IA de la cuenta se ha agotado",
    noModelForProvider: "no hay ningún modelo disponible para este proveedor",
    modelAbovePlan: "el modelo solicitado supera el límite del plan",
    executionBackendUnavailable:
      "no hay ningún entorno de ejecución configurado en la instancia",
    promptRequired: "el paso no tenía ninguna instrucción que enviar",
    issueNotFound: "la incidencia ya no existe",
    entitlement:
      "las automatizaciones no están incluidas en el plan del proyecto",
    taken_over: "alguien se hizo cargo de la incidencia",
    gone: "la incidencia o el proyecto se eliminó",
    expired: "esperó demasiado para empezar",
    stalled: "se detuvo sin dejar nada que reanudar",
  },
};

const STRINGS: Record<
  Locale,
  {
    header: string;
    awaiting: string;
    completed: string;
    stopped: (reason: string) => string;
    steps: (n: number) => string;
    spent: (percent: string) => string;
    verdict: string;
    blockers: string;
    resume: string;
    unknownReason: string;
  }
> = {
  fr: {
    header: "Automatisation numo",
    awaiting: "Le plan est prêt et vérifié. La suite attend ton feu vert.",
    completed: "La chaîne est allée au bout.",
    stopped: (reason) => `La chaîne s'est arrêtée : ${reason}.`,
    steps: (n) => `${n} étape${n > 1 ? "s" : ""} jouée${n > 1 ? "s" : ""}`,
    spent: (percent) => `${percent} du budget mensuel consommé`,
    verdict: "Verdict",
    blockers: "Points bloquants",
    resume: "Continuer ou arrêter depuis le panneau du ticket.",
    unknownReason: "une condition d'exécution n'était plus remplie",
  },
  en: {
    header: "Numo automation",
    awaiting:
      "The plan is written and checked. The rest is waiting on your go-ahead.",
    completed: "The chain ran to the end.",
    stopped: (reason) => `The chain stopped: ${reason}.`,
    steps: (n) => `${n} step${n > 1 ? "s" : ""} played`,
    spent: (percent) => `${percent} of the monthly budget used`,
    verdict: "Verdict",
    blockers: "Blockers",
    resume: "Continue or stop it from the issue panel.",
    unknownReason: "an execution condition was no longer met",
  },
  de: {
    header: "Numo-Automatisierung",
    awaiting:
      "Der Plan ist erstellt und geprüft. Für den nächsten Schritt fehlt nur deine Freigabe.",
    completed: "Die Kette wurde vollständig ausgeführt.",
    stopped: (reason) => `Die Kette wurde angehalten, weil ${reason}.`,
    steps: (n) => `${n} Schritt${n === 1 ? "" : "e"} ausgeführt`,
    spent: (percent) => `${percent} des Monatsbudgets verbraucht`,
    verdict: "Ergebnis",
    blockers: "Blockierende Punkte",
    resume: "Setze sie im Ticketbereich fort oder halte sie dort an.",
    unknownReason: "eine Ausführungsbedingung nicht mehr erfüllt war",
  },
  "pt-BR": {
    header: "Automação do Numo",
    awaiting:
      "O plano foi escrito e verificado. O restante aguarda sua aprovação.",
    completed: "A cadeia chegou ao fim.",
    stopped: (reason) => `A cadeia parou porque ${reason}.`,
    steps: (n) =>
      `${n} etapa${n === 1 ? "" : "s"} executada${n === 1 ? "" : "s"}`,
    spent: (percent) => `${percent} do orçamento mensal utilizado`,
    verdict: "Resultado",
    blockers: "Bloqueios",
    resume: "Continue ou interrompa pelo painel da tarefa.",
    unknownReason: "uma condição de execução deixou de ser atendida",
  },
  it: {
    header: "Automazione Numo",
    awaiting:
      "Il piano è stato scritto e verificato. Il resto attende la tua approvazione.",
    completed: "La catena è arrivata fino alla fine.",
    stopped: (reason) => `La catena si è fermata perché ${reason}.`,
    steps: (n) =>
      `${n} passaggi${n === 1 ? "o" : ""} eseguit${n === 1 ? "o" : "i"}`,
    spent: (percent) => `${percent} del budget mensile utilizzato`,
    verdict: "Esito",
    blockers: "Blocchi",
    resume: "Continua o interrompi dal pannello del ticket.",
    unknownReason: "una condizione di esecuzione non era più soddisfatta",
  },
  es: {
    header: "Automatización de Numo",
    awaiting:
      "El plan está escrito y verificado. El resto espera tu aprobación.",
    completed: "La cadena llegó hasta el final.",
    stopped: (reason) => `La cadena se detuvo porque ${reason}.`,
    steps: (n) =>
      `${n} paso${n === 1 ? "" : "s"} ejecutado${n === 1 ? "" : "s"}`,
    spent: (percent) => `${percent} del presupuesto mensual utilizado`,
    verdict: "Resultado",
    blockers: "Bloqueos",
    resume: "Continúa o deténla desde el panel de la incidencia.",
    unknownReason: "una condición de ejecución dejó de cumplirse",
  },
};

async function localeOf(userId: string): Promise<Locale> {
  try {
    const r = await getAccountSettings({ userId });
    if (r.ok) return r.settings.locale;
  } catch {
    // ignore — app default
  }
  return defaultLocale;
}

/**
 * The expense, as part of the monthly budget of the owner's plan. Rendered as a percentage
 * rounded — “3%”, never “$0.42”. Null if the plan does not have a budget included
 * (we do not divide by zero to reassure).
 */
async function spentShare(chain: AgentChain): Promise<string | null> {
  try {
    const { plan } = await getResolvedBilling(chain.owner_id);
    if (!plan.includedUsageUsd) return null;
    const share = (chain.spent_usd / plan.includedUsageUsd) * 100;
    // A channel with 0.3% should not display “0%”: this is false and is correct
    // see. Below 1%, we tell it like it is.
    return share > 0 && share < 1 ? "<1 %" : `${Math.round(share)} %`;
  } catch {
    return null;
  }
}

export interface ChainReportExtras {
  /** Summary of the last verification verdict, if the step produced one. */
  verdictSummary?: string | null;
  verdictBlockers?: string[];
}

/**
 * Posts the channel report on the ticket. Best-effort: a comment that
 * does not leave should never cause a channel to fail to stop or advance.
 */
export async function postChainComment(
  chain: AgentChain,
  kind: ChainReportKind,
  extras: ChainReportExtras = {},
): Promise<void> {
  try {
    const locale = await localeOf(chain.owner_id);
    const s = STRINGS[locale];
    const lines: string[] = [`**${s.header}**`, ""];

    if (kind === "awaiting_human") {
      lines.push(s.awaiting, "", s.resume);
    } else if (kind === "completed") {
      lines.push(s.completed);
    } else {
      const reasons = STOP_REASONS[locale];
      const reason =
        (chain.stop_reason && reasons[chain.stop_reason]) || s.unknownReason;
      lines.push(s.stopped(reason));
    }

    if (extras.verdictSummary?.trim()) {
      lines.push("", `**${s.verdict}** — ${extras.verdictSummary.trim()}`);
    }
    if (extras.verdictBlockers?.length) {
      lines.push(
        "",
        `**${s.blockers}**`,
        ...extras.verdictBlockers.map((b) => `- ${b}`),
      );
    }

    const share = await spentShare(chain);
    const facts = [s.steps(chain.step), ...(share ? [s.spent(share)] : [])];
    lines.push("", `_${facts.join(" · ")}_`);

    const service = getServiceClient();
    await service.from("comments").insert({
      issue_id: chain.issue_id,
      author_id: chain.owner_id,
      body: lines.join("\n"),
      via_assistant: true,
    });
  } catch (err) {
    console.error(
      "[automations] chain comment failed:",
      (err as Error).message,
    );
  }
}

/**
 * Spending brackets for analytics — never the amount: what we want
 * to know is whether the channels cost "nothing", "a little" or "a lot", not
 * how much did a given account pay.
 */
function spentBucket(usd: number): string {
  if (usd <= 0) return "0";
  if (usd < 0.1) return "<0.1";
  if (usd < 0.5) return "0.1-0.5";
  if (usd < 2) return "0.5-2";
  return ">2";
}

/** Analytics of a string that opens (MIN-147, SERVER event). */
export function captureChainStarted(
  chain: AgentChain,
  meta: { effort: string | null; plannedSteps: number },
): void {
  captureServerEvent({
    distinctId: chain.owner_id,
    event: "automation_chain_started",
    properties: {
      preset: chain.preset ?? "custom",
      effort: meta.effort ?? "none",
      planned_steps: meta.plannedSteps,
      project_id: chain.project_id,
    },
    groups: { project: chain.project_id },
  });
}

/** Analytics for a string that ends in any way. */
export function captureChainFinished(
  chain: AgentChain,
  outcome: "completed" | "stopped",
  keyMode: "platform" | "byok" | "unknown" = "unknown",
): void {
  captureServerEvent({
    distinctId: chain.owner_id,
    event: "automation_chain_finished",
    properties: {
      preset: chain.preset ?? "custom",
      outcome,
      // The pattern is already a closed CODE (see `stopChain`) — never free text.
      stop_reason: chain.stop_reason ?? "none",
      steps: chain.step,
      retries: chain.retries,
      key_mode: keyMode,
      spent_bucket: spentBucket(chain.spent_usd),
      project_id: chain.project_id,
    },
    groups: { project: chain.project_id },
  });
}

/**
 * STOPs a channel and makes it known: report comment, inbox notification
 *, analytics. The obligatory passage of any end suffered - a silent shutdown
 * would be worse than no automation at all, since the ticket would remain there,
 * half-done, without anything saying so.
 *
 * Out of `AGENT_TYPES` (lib/server/notifications.ts) on purpose :`replaceUnread`
 * clears unread brothers there, and a "terminated agent" should not clear a
 * "the chain has stopped".
 */
export async function haltChain(
  chain: AgentChain,
  reason: string,
  extras: ChainReportExtras = {},
): Promise<void> {
  const stopped = await stopChain(chain.id, reason);
  if (!stopped) return;
  await postChainComment(stopped, "stopped", extras);
  await notifyChain(stopped, "automation_stopped");
  captureChainFinished(stopped, "stopped");
}

/** The channel has followed its rules: reporting + analytics, no
 * notification — the end of the last run has already produced one. */
export async function finishChain(chain: AgentChain): Promise<void> {
  const done = await completeChain(chain.id);
  if (!done) return;
  await postChainComment(done, "completed");
  captureChainFinished(done, "completed");
}

export async function notifyChain(
  chain: AgentChain,
  type: "automation_paused" | "automation_stopped",
): Promise<void> {
  try {
    await insertNotifications(getServiceClient(), [
      {
        user_id: chain.owner_id,
        project_id: chain.project_id,
        type,
        issue_id: chain.issue_id,
        actor_id: null,
        via_automation: true,
      },
    ]);
  } catch (err) {
    console.error(
      "[automations] chain notification failed:",
      (err as Error).message,
    );
  }
}
