/**
 * Cost multiplier of a model — what the picker displays ("×2.4") and what
 * the plan caps (`BillingPlan.maxModelMultiplier`).
 *
 * Definition: average of entry and exit prices per million tokens,
 * compared to that of MINDDY'S DEFAULT MODEL (`app_config.agent_model`).
 * The baseline is therefore always worth ×1, and the entire scale is recalculated alone on
 * day when the admin changes this default — a hard-written multiplier table
 * would have lied from the generation of models following.
 *
 * The average (input + output) / 2 is deliberately crude: the true ratio
 * depends on the shape of the traffic (an agent reads much more than it writes, and the
 * prompt cache changes the situation again). What we show is an order of
 * comparable size from one model to another, not an invoice.
 *
 * SHARED client/server module: no server-only import. The value is calculated
 * on the server side (the model catalog), the client only formats it.
 */

export interface ModelPricing {
  /** USD per million input tokens. */
  inputUsdPerMTok: number;
  /** USD par million de tokens de sortie. */
  outputUsdPerMTok: number;
}

/** Average entry/exit price, per million tokens. */
export function averageUsdPerMTok(pricing: ModelPricing): number {
  return (pricing.inputUsdPerMTok + pricing.outputUsdPerMTok) / 2;
}

/**
 * Multiplier of a model against the baseline, already ROUNDED (cf.
 * `roundMultiplier`). `null` when it means nothing: unknown prices (model
 * outside the OpenRouter catalog, provider BYOK) or free baseline — the report
 * would be a division by zero. A `null` never blocks: we do not prohibit
 * on ignorance.
 */
export function modelCostMultiplier(
  pricing: ModelPricing | null | undefined,
  baseline: ModelPricing | null | undefined,
): number | null {
  if (!pricing || !baseline) return null;
  const base = averageUsdPerMTok(baseline);
  if (!(base > 0)) return null;
  return roundMultiplier(averageUsdPerMTok(pricing) / base);
}

/**
 * CANONICAL rounding: the value displayed IS the value compared to the cap.
 * Without it, a model at ×1.549 would display “×1.5” — in the Free cap —
 * and would be refused at launch (1.549 > 1.5). The screen would lie.
 */
export function roundMultiplier(value: number): number {
  if (value >= 10) return Math.round(value);
  if (value >= 1) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

/** “×2.4” — the decimal separator follows the locale. */
export function formatMultiplier(value: number, locale: string): string {
  return `×${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}`;
}

/**
 * Does the model fit within the plan ceiling? An unknown multiplier passes:
 * refusing on ignorance would block models too recent for the index and
 * all endpoints which do not publish their prices.
 */
export function isMultiplierWithinPlan(
  multiplier: number | null | undefined,
  maxMultiplier: number,
): boolean {
  return multiplier == null || multiplier <= maxMultiplier;
}
