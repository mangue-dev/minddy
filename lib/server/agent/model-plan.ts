import "server-only";

import type { BillingPlanId } from "@/lib/billing-plans";
import {
  isMultiplierWithinPlan,
  modelCostMultiplier,
  type ModelPricing,
} from "@/lib/model-multiplier";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { PlanLimitError } from "@/lib/server/plan-limit-error";
import { getRootDefaultModel } from "./model";
import { getOpenRouterModelInfo } from "./openrouter-index";

/**
 * Le plafond de modèle par plan : ce qui rend « x1,5 / x4 / x10 » exécutoire.
 *
 * Deux règles, et elles expliquent tout le reste :
 *
 *  1. **Quota minddy seulement.** En BYOK, l'utilisateur paye ses propres
 *     tokens : lui refuser un modèle serait lui refuser SON argent. Les
 *     appelants passent donc le `mode` qu'ils connaissent déjà (`checkAgentQuota`
 *     le calcule au lancement) ; la review de PR, elle, tourne toujours sur la
 *     clé plateforme et passe donc toujours `platform`.
 *
 *  2. **Ce que l'utilisateur CHOISIT, pas ce que minddy résout.** Le plafond
 *     porte sur un modèle nommé par quelqu'un — override de run, défaut perso,
 *     modèle retenu pour la review. Les défauts de l'instance (`agent_model`,
 *     `pr_review_model`) n'y sont jamais soumis : `pr_review_model` vaut
 *     délibérément un modèle cher (relire du code demande un autre regard), et
 *     un plafond qui refuserait le propre défaut de minddy laisserait un compte
 *     Go sans aucun chemin vers une review.
 *
 * On ne refuse jamais sur une ignorance : prix inconnus (modèle absent de
 * l'index, endpoint qui ne publie rien) → autorisé. Le budget d'usage reste
 * derrière comme plafond dur.
 */

/** Ce qu'un compte a le droit de choisir, et l'échelle sur laquelle le lire. */
export interface ModelPlanLimit {
  planId: BillingPlanId;
  /** Plafond du plan, en multiplicateur du modèle par défaut de minddy. */
  maxMultiplier: number;
  /** Prix du baseline — `null` quand l'échelle n'est pas calculable. */
  baseline: ModelPricing | null;
}

/** Prix du modèle par défaut de minddy — l'origine de l'échelle (×1). */
export async function getBaselinePricing(): Promise<ModelPricing | null> {
  const baseline = await getRootDefaultModel();
  return (await getOpenRouterModelInfo(baseline))?.pricing ?? null;
}

/** Le plafond applicable à ce compte, et le baseline pour situer les modèles. */
export async function getModelPlanLimit(userId: string): Promise<ModelPlanLimit> {
  const [{ plan }, baseline] = await Promise.all([
    getResolvedBilling(userId),
    getBaselinePricing(),
  ]);
  return { planId: plan.id, maxMultiplier: plan.maxModelMultiplier, baseline };
}

/** Multiplicateur d'un modèle sur une échelle donnée. `null` = incalculable. */
export async function getModelMultiplier(
  model: string,
  baseline: ModelPricing | null,
): Promise<number | null> {
  if (!baseline) return null;
  const info = await getOpenRouterModelInfo(model);
  return modelCostMultiplier(info?.pricing, baseline);
}

/**
 * Garde d'un modèle CHOISI par l'utilisateur : lève `model_above_plan` (403) si
 * son multiplicateur dépasse le plafond du plan. `mode: "byok"` ne vérifie rien.
 *
 * Les paramètres de l'erreur portent le modèle, son multiplicateur et le plafond :
 * l'écran doit pouvoir dire « Claude Opus 5 (×12) dépasse le plafond de votre
 * plan Go (×4) », pas « modèle refusé ».
 */
export async function ensureModelInPlan(opts: {
  userId: string;
  model: string;
  mode: "platform" | "byok";
}): Promise<void> {
  if (opts.mode === "byok") return;
  const limit = await getModelPlanLimit(opts.userId);
  const multiplier = await getModelMultiplier(opts.model, limit.baseline);
  if (isMultiplierWithinPlan(multiplier, limit.maxMultiplier)) return;
  throw new PlanLimitError("model_above_plan", {
    model: opts.model,
    // Nombres, pas chaînes : le « × » vit dans le message et next-intl écrit la
    // décimale selon la locale de qui lit.
    multiplier: multiplier as number,
    limit: limit.maxMultiplier,
    plan: planLabel(limit.planId),
  });
}

/** Nom affichable d'un plan : son id capitalisé (« go » → « Go »). */
function planLabel(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
