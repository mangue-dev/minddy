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
    console.error("[automations] chain notification failed:", (err as Error).message);
  }
}
