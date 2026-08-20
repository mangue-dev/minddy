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
 * The model cap per plan: what makes "x1.5 / x4 / x10" enforceable.
 *
 * Two rules, and they explain everything else:
 *
 * 1. **Minddy quota only.** BYOK users pay for their own tokens, so the
 * product does not limit their model choice.
 *
 * 2. **What the user CHOOSES, not what minddy solves.** The cap
 * concerns a model named by someone — run override, default personal,
 * model retained for the review. The instance's defaults (`agent_model`,
 * `pr_review_model`) are never subject to it: `pr_review_model` is worth
 * deliberately an expensive model (reading code again requires another look), and
 * a cap that would deny minddy's own default would leave an account
 * Go without any path to a review.
 *
 * We never refuse on ignorance: unknown prices (model absent from the index,
 * endpoint which publishes nothing) → authorized. The platform usage budget
 * remains behind as a hard ceiling.
 */

/** What an account is allowed to choose, and the scale on which to read it. */
export interface ModelPlanLimit {
  planId: BillingPlanId;
  /** Plan ceiling, multiplied by minddy's default model. */
  maxMultiplier: number;
  /** Baseline price — `null` when the scale is not calculable. */
  baseline: ModelPricing | null;
}

/** Minddy's default model price — the origin of the scale (×1). */
export async function getBaselinePricing(): Promise<ModelPricing | null> {
  const baseline = await getRootDefaultModel();
  return (await getOpenRouterModelInfo(baseline))?.pricing ?? null;
}

/** The ceiling applicable to this account, and the baseline to locate the models. */
export async function getModelPlanLimit(userId: string): Promise<ModelPlanLimit> {
  const [{ plan }, baseline] = await Promise.all([
    getResolvedBilling(userId),
    getBaselinePricing(),
  ]);
  return { planId: plan.id, maxMultiplier: plan.maxModelMultiplier, baseline };
}

/** Multiplier of a model on a given scale. `null` = incalculable. */
export async function getModelMultiplier(
  model: string,
  baseline: ModelPricing | null,
): Promise<number | null> {
  if (!baseline) return null;
  const info = await getOpenRouterModelInfo(model);
  return modelCostMultiplier(info?.pricing, baseline);
}

/**
 * Guard of a model CHOSEN by the user: raises `model_above_plan` (403) if
 * its multiplier exceeds the plan cap. BYOK skips this check.
 *
 * The error parameters carry the model, its multiplier and the ceiling:
 * the screen should be able to say "Claude Opus 5 (×12) exceeds the ceiling of your
 * Go plan (×4)", not "model refused .
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
    // Numbers, not strings: the “×” lives in the message and next-intl writes it
    // decimal according to the locale of who is reading.
    multiplier: multiplier as number,
    limit: limit.maxMultiplier,
    plan: planLabel(limit.planId),
  });
}

/** Displayable name of a plan: its capitalized id (“go” → “Go”). */
function planLabel(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
