import type { IssueEffort } from "@/lib/issue-constants";
import { hasPlanTasks } from "@/lib/plan";

/** Clé i18n du corps du prompt de lancement (namespace `Agent.launchPrompt`).
 *  `writePlan` / `reviewPlan` ne sont jamais choisies par
 *  `agentLaunchPromptVariant` : elles répondent à une demande EXPLICITE de
 *  l'utilisateur (entrée « Générer un plan » / « Vérifier le plan », bouton de
 *  l'onglet Plan) — cadrer le ticket, sans l'implémenter. Voir
 *  `agentPlanPromptVariant`. */
export type AgentLaunchPromptVariant =
  | "planExists"
  | "planExistsXl"
  | "xs"
  | "s"
  | "xl"
  | "default"
  | "writePlan"
  | "reviewPlan";

/**
 * Choisit la variante du prompt pré-écrit du composer de lancement selon l'issue.
 * Logique PURE (pas de texte) : le texte, localisé, vit dans `Agent.launchPrompt.*`
 * et l'appelant l'assemble `head + "\n\n" + <variante>` avec son translator.
 *
 * Deux axes :
 *  • Un PLAN existe déjà (issue.plan avec des tâches) → on demande de le SUIVRE
 *    (pour un XL déjà planifié, on garde le checkpoint : relire puis demander).
 *  • Sinon, la profondeur de cadrage suit l'EFFORT (t-shirt) :
 *      XS       → implémentation directe, pas de plan ;
 *      S        → plan léger si la tâche le mérite, puis implémentation ;
 *      M/L/none → plan clair, puis implémentation ;
 *      XL       → plan, puis STOP et demande avant d'implémenter.
 */
export function agentLaunchPromptVariant(issue: {
  plan: string | null;
  effort: IssueEffort | null;
}): AgentLaunchPromptVariant {
  if (hasPlanTasks(issue.plan))
    return issue.effort === "xl" ? "planExistsXl" : "planExists";

  switch (issue.effort) {
    case "xs":
      return "xs";
    case "s":
      return "s";
    case "xl":
      return "xl";
    case "m":
    case "l":
    default:
      // Effort M/L ou non renseigné : cadrer puis exécuter.
      return "default";
  }
}

/**
 * Variante du prompt quand l'utilisateur demande explicitement de travailler le
 * PLAN et rien d'autre : l'écrire s'il n'existe pas, le VÉRIFIER point par point
 * s'il existe déjà — redemander un plan à un ticket qui en a un n'a pas de sens.
 */
export function agentPlanPromptVariant(issue: {
  plan: string | null;
}): "writePlan" | "reviewPlan" {
  return hasPlanTasks(issue.plan) ? "reviewPlan" : "writePlan";
}
