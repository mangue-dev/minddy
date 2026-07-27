// Construction PURE du message qui LANCE l'agent de code sur un ticket, pour les
// appelants qui n'ont pas de composer sous la main — l'assistant Numo (chat et
// @numo en commentaire). Aucune DB, aucun secret, pas d'import `server-only` :
// l'appelant fournit déjà les champs du ticket, donc ce module est testable en
// node/vitest, comme prompt.ts.
//
// Les textes ne sont PAS réécrits ici : ce sont exactement ceux des boutons de
// l'UI (`Agent.launchPrompt.*` dans messages/<locale>.json), lus avec
// `createTranslator` plutôt qu'avec `getTranslations` — un lancement peut partir
// d'un contexte détaché de la requête (@numo en fond), où `cookies()`/`headers()`
// ne sont plus disponibles. Une seule source de vérité pour les trois modes :
// changer la consigne d'un bouton change celle de l'assistant.

import { createTranslator } from "next-intl";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import type { AgentLaunchIntent } from "@/lib/server/agent/launch";
import {
  agentLaunchPromptVariant,
  agentPlanPromptVariant,
  type AgentLaunchPromptVariant,
} from "@/lib/agent-launch-prompt";
import { issueIdentifier, type IssueEffort } from "@/lib/issue-constants";

/**
 * Les trois façons NATIVES de lancer l'agent sur un ticket — les mêmes que les
 * boutons de l'app, pour que l'assistant ne parte pas d'une consigne maison :
 *  • `plan`      — cadrer le ticket sans l'implémenter (écrire le plan s'il n'y
 *                  en a pas, le VÉRIFIER point par point s'il existe) ;
 *  • `implement` — faire le travail (la consigne suit le plan et l'effort) ;
 *  • `verify`    — relire l'implémentation déjà faite face au plan et aux
 *                  commentaires, et corriger les vrais bugs.
 * Hors de ces trois-là, l'assistant envoie librement son propre prompt.
 */
export const AGENT_LAUNCH_MODES = ["plan", "implement", "verify"] as const;
export type AgentLaunchMode = (typeof AGENT_LAUNCH_MODES)[number];

export function isAgentLaunchMode(value: unknown): value is AgentLaunchMode {
  return (AGENT_LAUNCH_MODES as readonly unknown[]).includes(value);
}

/** Champs du ticket dont le message a besoin (rien de plus n'est lu). */
export interface LaunchMessageIssue {
  number: number;
  title: string;
  plan: string | null;
  effort: IssueEffort | null;
}

/**
 * Clé i18n du corps du message pour un mode. `plan` et `implement` s'adaptent au
 * ticket (plan existant, effort t-shirt) exactement comme les entrées de menu ;
 * `verify` ne dépend de rien — il n'y a qu'une façon de relire du travail fait.
 */
export function launchPromptVariantForMode(
  mode: AgentLaunchMode,
  issue: Pick<LaunchMessageIssue, "plan" | "effort">
): AgentLaunchPromptVariant {
  switch (mode) {
    case "plan":
      return agentPlanPromptVariant(issue);
    case "verify":
      return "verifyImplementation";
    default:
      return agentLaunchPromptVariant(issue);
  }
}

/**
 * Ce que le lancement fait au STATUT du ticket. Les trois modes portent les
 * mêmes noms que les trois intentions — le mode dit ce qu'on DEMANDE, l'intention
 * ce que ça fait au ticket — donc la conversion est l'identité, et elle existe
 * pour que ça reste vrai par écrit : seul « implémenter » est du travail neuf,
 * cadrer vient avant et vérifier vient après, tous deux laissant le ticket
 * exactement où il est (un ticket en revue qu'on fait contrôler doit y rester).
 */
export function intentForLaunchMode(mode: AgentLaunchMode): AgentLaunchIntent {
  return mode;
}

function resolveLocale(raw: string | null | undefined): Locale {
  return raw && (locales as readonly string[]).includes(raw)
    ? (raw as Locale)
    : defaultLocale;
}

/**
 * Le message envoyé à l'agent : l'en-tête « Travaille sur MIN-42 : titre. » puis
 * la consigne du mode, dans la langue du demandeur — l'agent répond dans cette
 * langue-là (cf. `buildAgentSystemPrompt`), et le message reste lisible dans la
 * conversation du run. `extra` (les précisions que l'utilisateur a données à
 * l'assistant) est ajouté en dernier : il précise la consigne, il ne la remplace
 * pas.
 */
export async function buildAgentLaunchMessage(input: {
  mode: AgentLaunchMode;
  issue: LaunchMessageIssue;
  projectKey: string;
  locale?: string | null;
  extra?: string | null;
}): Promise<string> {
  const locale = resolveLocale(input.locale);
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({
    locale,
    messages,
    namespace: "Agent.launchPrompt",
  });

  const head = t("head", {
    identifier: issueIdentifier(input.projectKey, input.issue.number),
    title: input.issue.title,
  });
  const body = t(launchPromptVariantForMode(input.mode, input.issue));
  const extra = input.extra?.trim();

  return extra ? `${head}\n\n${body}\n\n${extra}` : `${head}\n\n${body}`;
}
