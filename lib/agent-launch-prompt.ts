import type { IssueEffort } from "@/lib/issue-constants";
import { parsePlan } from "@/lib/plan";

/** Clé i18n du corps du prompt de lancement (namespace `Agent.launchPrompt`).
 *  `writePlan` n'est jamais choisie par `agentLaunchPromptVariant` : c'est une
 *  demande EXPLICITE de l'utilisateur (bouton « Écrire avec Numo » de l'onglet
 *  Plan) — cadrer le ticket, sans l'implémenter. */
export type AgentLaunchPromptVariant =
  | "planExists"
  | "planExistsXl"
  | "xs"
  | "s"
  | "xl"
  | "default"
  | "writePlan";

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
  const hasPlan = parsePlan(issue.plan).tasks.length > 0;
  if (hasPlan) return issue.effort === "xl" ? "planExistsXl" : "planExists";

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
