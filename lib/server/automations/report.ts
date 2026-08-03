import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAccountSettings } from "@/lib/server/account-settings";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { insertNotifications } from "@/lib/server/notifications";
import { captureServerEvent } from "@/lib/server/posthog";
import { defaultLocale, type Locale } from "@/i18n/config";
import { completeChain, stopChain, type AgentChain } from "./chain";

/**
 * Le RAPPORT d'une chaîne (MIN-147) : un commentaire Numo sur le ticket, aux
 * trois moments où quelqu'un doit savoir ce qui s'est passé sans avoir eu à
 * regarder — la chaîne l'attend, elle est allée au bout, elle s'est arrêtée.
 *
 * Attribution identique à `postPrComment` (execute.ts) : ligne `comments` avec
 * `author_id = chain.owner_id` et `via_assistant: true` — c'est Numo qui parle,
 * sous le compte qui porte techniquement l'écriture.
 *
 * Les textes vivent ICI et non dans `messages/*.json`, comme les autres
 * commentaires écrits par l'agent : ils sont produits hors requête, dans un
 * `after()` où `cookies()`/`headers()` n'existent plus, et la langue est celle du
 * compte de la chaîne, pas celle d'un lecteur.
 *
 * JAMAIS DE DOLLARS : la dépense s'écrit en part du budget mensuel du plan, comme
 * partout ailleurs dans le produit.
 */

export type ChainReportKind = "awaiting_human" | "completed" | "stopped";

/** Ce que le rapport dit d'un arrêt, motif par motif. Un code inconnu retombe
 *  sur une phrase générique plutôt que sur le code brut. */
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
    promptRequired: "the step had no instruction to send",
    issueNotFound: "the issue no longer exists",
    entitlement: "automations are not included in the project's plan",
    taken_over: "someone took the issue over",
    gone: "the issue or project was deleted",
    expired: "it waited too long to start",
    stalled: "it stopped with nothing left to resume",
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
    awaiting: "The plan is written and checked. The rest is waiting on your go-ahead.",
    completed: "The chain ran to the end.",
    stopped: (reason) => `The chain stopped: ${reason}.`,
    steps: (n) => `${n} step${n > 1 ? "s" : ""} played`,
    spent: (percent) => `${percent} of the monthly budget used`,
    verdict: "Verdict",
    blockers: "Blockers",
    resume: "Continue or stop it from the issue panel.",
    unknownReason: "an execution condition was no longer met",
  },
};

async function localeOf(userId: string): Promise<Locale> {
  try {
    const r = await getAccountSettings({ userId });
    if (r.ok) return r.settings.locale;
  } catch {
    // ignore — défaut de l'app
  }
  return defaultLocale;
}

/**
 * La dépense, en part du budget mensuel du plan du owner. Rendue en pourcentage
 * arrondi — « 3 % », jamais « 0,42 $ ». Null si le plan n'a pas de budget inclus
 * (on ne divise pas par zéro pour rassurer).
 */
async function spentShare(chain: AgentChain): Promise<string | null> {
  try {
    const { plan } = await getResolvedBilling(chain.owner_id);
    if (!plan.includedUsageUsd) return null;
    const share = (chain.spent_usd / plan.includedUsageUsd) * 100;
    // Une chaîne à 0,3 % ne doit pas s'afficher « 0 % » : c'est faux et ça se
    // voit. Sous 1 %, on le dit tel quel.
    return share > 0 && share < 1 ? "<1 %" : `${Math.round(share)} %`;
  } catch {
    return null;
  }
}

export interface ChainReportExtras {
  /** Résumé du dernier verdict de vérification, si l'étape en a produit un. */
  verdictSummary?: string | null;
  verdictBlockers?: string[];
}

/**
 * Poste le rapport de la chaîne sur le ticket. Best-effort : un commentaire qui
 * ne part pas ne doit jamais faire échouer l'arrêt ou l'avancement d'une chaîne.
 */
export async function postChainComment(
  chain: AgentChain,
  kind: ChainReportKind,
  extras: ChainReportExtras = {},
): Promise<void> {
  try {
    const locale = await localeOf(chain.owner_id);
    const s = STRINGS[locale] ?? STRINGS.en;
    const lines: string[] = [`**${s.header}**`, ""];

    if (kind === "awaiting_human") {
      lines.push(s.awaiting, "", s.resume);
    } else if (kind === "completed") {
      lines.push(s.completed);
    } else {
      const reasons = STOP_REASONS[locale] ?? STOP_REASONS.en;
      const reason =
        (chain.stop_reason && reasons[chain.stop_reason]) || s.unknownReason;
      lines.push(s.stopped(reason));
    }

    if (extras.verdictSummary?.trim()) {
      lines.push("", `**${s.verdict}** — ${extras.verdictSummary.trim()}`);
    }
    if (extras.verdictBlockers?.length) {
      lines.push("", `**${s.blockers}**`, ...extras.verdictBlockers.map((b) => `- ${b}`));
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
    console.error("[automations] chain comment failed:", (err as Error).message);
  }
}

/**
 * Tranches de dépense pour l'analytics — jamais le montant : ce qu'on veut
 * savoir, c'est si les chaînes coûtent « rien », « un peu » ou « beaucoup », pas
 * combien a payé tel compte.
 */
function spentBucket(usd: number): string {
  if (usd <= 0) return "0";
  if (usd < 0.1) return "<0.1";
  if (usd < 0.5) return "0.1-0.5";
  if (usd < 2) return "0.5-2";
  return ">2";
}

/** Analytics d'une chaîne qui s'ouvre (MIN-147, événement SERVEUR). */
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

/** Analytics d'une chaîne qui se termine, quelle qu'en soit la façon. */
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
      // Le motif est déjà un CODE fermé (cf. `stopChain`) — jamais du texte libre.
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
 * ARRÊTE une chaîne et le fait savoir : commentaire de rapport, notification
 * d'inbox, analytics. Le passage obligé de toute fin subie — un arrêt muet
 * serait pire que pas d'automatisation du tout, puisque le ticket resterait là,
 * à moitié fait, sans que rien ne le dise.
 *
 * Hors de `AGENT_TYPES` (lib/server/notifications.ts) à dessein : `replaceUnread`
 * y efface les frères non lus, et un « agent terminé » ne doit pas effacer un
 * « la chaîne s'est arrêtée ».
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

/** La chaîne est allée au bout de ses règles : rapport + analytics, pas de
 *  notification — la fin du dernier run en a déjà produit une. */
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
    console.error("[automations] chain notification failed:", (err as Error).message);
  }
}
