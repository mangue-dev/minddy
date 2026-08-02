import "server-only";

import { updateIssueFields } from "@/lib/server/update-issue";
import { launchAgentRun } from "@/lib/server/agent/launch";
import {
  buildAgentLaunchMessage,
  intentForLaunchMode,
} from "@/lib/server/agent/launch-message";
import { getAccountSettings } from "@/lib/server/account-settings";
import { defaultLocale } from "@/i18n/config";
import type { AutomationAction } from "@/lib/automations";
import { lastVerdictOfChain, parkChain, type AgentChain } from "./chain";
import { haltChain, notifyChain, postChainComment } from "./report";

/**
 * Exécution des quatre actions d'une règle (MIN-147).
 *
 * Rien n'est réinventé côté agent : `launchAgentRun` est déjà le point d'entrée
 * UNIQUE d'un run froid, et `buildAgentLaunchMessage` sait écrire les consignes
 * cadrées sans contexte de requête — il a justement été écrit pour les appelants
 * qui n'ont pas de composer sous la main.
 *
 * Un échec de lancement ARRÊTE la chaîne avec son motif, jamais en silence :
 * `LaunchError` en distingue huit, et c'est ce code-là que le commentaire de
 * rapport ira traduire. Une chaîne qui s'éteint sans rien dire serait pire que
 * pas d'automatisation du tout.
 */

/** Ce qu'une action a fait de la chaîne, du point de vue du moteur. */
export type ActionOutcome =
  /** Un run est parti : la chaîne attend sa fin, le crochet reprendra la main. */
  | { kind: "launched"; runId: string }
  /** L'action a été jouée et le moteur peut enchaîner sur l'événement produit. */
  | { kind: "continue" }
  /** La chaîne est garée (point d'arrêt humain) ou arrêtée : plus rien à jouer. */
  | { kind: "halted" };

/** Champs du ticket dont l'écriture d'une consigne a besoin. */
interface IssueForLaunch {
  id: string;
  number: number;
  title: string;
  plan: string | null;
  effort: "xs" | "s" | "m" | "l" | "xl" | null;
  project_key: string;
}

async function localeOf(userId: string): Promise<string> {
  try {
    const r = await getAccountSettings({ userId });
    if (r.ok) return r.settings.locale;
  } catch {
    // ignore
  }
  return defaultLocale;
}

async function runNumo(
  chain: AgentChain,
  action: Extract<AutomationAction, { type: "run_numo" }>,
  issue: IssueForLaunch,
  extraPrompt: string | null,
  model: string | null,
): Promise<ActionOutcome> {
  const locale = await localeOf(chain.owner_id);
  // Mode `custom` : la consigne de la règle EST le message. Les trois autres
  // reprennent mot pour mot celle des boutons de l'app — une seule source de
  // vérité, ici comme pour l'assistant.
  const prompt =
    action.mode === "custom"
      ? [action.prompt ?? "", extraPrompt ?? ""].filter(Boolean).join("\n\n")
      : await buildAgentLaunchMessage({
          mode: action.mode,
          issue: {
            number: issue.number,
            title: issue.title,
            plan: issue.plan,
            effort: issue.effort,
          },
          projectKey: issue.project_key,
          locale,
          extra: extraPrompt,
          fromChain: true,
        });

  const result = await launchAgentRun({
    issueId: issue.id,
    userId: chain.owner_id,
    triggeredBy: "automation",
    intent: action.mode === "custom" ? "custom" : intentForLaunchMode(action.mode),
    prompt,
    // Le modèle par TAILLE de ticket (réglage de compte) l'emporte sur celui de
    // la règle : c'est celui que l'utilisateur voit et manipule.
    model: model ?? action.model ?? null,
    reasoningLevel: action.reasoningLevel ?? null,
    chainId: chain.id,
  });

  if (!result.ok) {
    await haltChain(chain, result.error);
    return { kind: "halted" };
  }
  return { kind: "launched", runId: result.run.id };
}

/**
 * Point d'arrêt humain. La chaîne se gare, le ticket ne bouge pas, et on prévient
 * le compte qui la porte — c'est le seul moment où la boucle a besoin de
 * quelqu'un, il ne doit pas se découvrir par hasard.
 */
async function awaitHuman(chain: AgentChain): Promise<ActionOutcome> {
  const parked = await parkChain(chain.id);
  if (!parked) return { kind: "halted" };
  // Le verdict de l'étape qui amène ici — la vérification du plan. C'est
  // exactement ce sur quoi on demande un feu vert : sans lui, le commentaire
  // annonce « le plan est vérifié » sans dire ce que la vérification a conclu,
  // et il faut ouvrir la session de l'agent pour le savoir.
  const verdict = await lastVerdictOfChain(parked.id);
  await postChainComment(parked, "awaiting_human", {
    verdictSummary: verdict?.summary ?? null,
    verdictBlockers: verdict?.blockers ?? [],
  });
  await notifyChain(parked, "automation_paused");
  return { kind: "halted" };
}

export async function runAction(params: {
  chain: AgentChain;
  action: AutomationAction;
  issue: IssueForLaunch;
  /** Consigne ajoutée à l'étape (le rapport d'une vérification en échec). */
  extraPrompt?: string | null;
  /** Modèle réglé pour la TAILLE de ce ticket (Compte → Automatisations). */
  model?: string | null;
}): Promise<ActionOutcome> {
  const { chain, action, issue } = params;
  switch (action.type) {
    case "run_numo":
      return runNumo(chain, action, issue, params.extraPrompt ?? null, params.model ?? null);
    case "set_status":
      // Repasse par le cœur d'écriture ordinaire : c'est lui qui écrit
      // l'activité, les notifications et la synchro du feedback. Il redéclenche
      // donc le crochet de statut, et c'est voulu — `played_rule_ids` et
      // `MAX_CHAIN_STEPS` sont ce qui empêche la boucle.
      await updateIssueFields({
        issueId: issue.id,
        actorId: chain.owner_id,
        input: { status: action.status },
        viaAssistant: true,
      });
      return { kind: "continue" };
    case "await_human":
      return awaitHuman(chain);
    case "stop":
      await haltChain(chain, "rule");
      return { kind: "halted" };
  }
}
