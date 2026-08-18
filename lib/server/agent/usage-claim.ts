import type { ModelPricing } from "@/lib/model-multiplier";

/**
 * WHAT THE MICROVM SAYS IT SPENT, reduced to what is possible (MIN-329).
 *
 * `POST /api/agent-vm/usage` is the ONLY budget record: the line it writes is what counts toward the account's monthly quota and cap du
 * run. However, the body of this request comes from a loop driven by a model which
 * reads third-party content — issues, diffs, web pages. One injection was enough to y
 * post a negative `cost`: the sum for the month FALLED DOWN, and the spending limit jumped for the entire account. The same path, in the other direction,
 * charged a fictitious expense to the owner of the run.
 *
 * The defense holds in two stages, and the second is the real one:
 *
 * 1. **Limits** — an amount is a finite number, positive or zero, under un
 * cap per line; a token count can be neither negative nor delusional.
 * Outside the limits, the line is REFUSED (nothing is written) and it is traced.
 * 2. **A CALCULATED ceiling** — the tokens reported at the published rate of the model
 * give what this call can cost at most. Above, we do not write
 * the number of the VM but ours, marked `estimated`. This is what makes
 * the amount is no longer a declaration: the only leverage left to a VM
 * is to lie about its tokens, and those are limited too.
 *
 * Why CAP rather than systematically replace: the cost reported by
 * the supplier is the real invoice (cache discounts, negotiated rates, BYOK),
 * our calculation is only an addition to the displayed price. Replacing it everywhere
 * would make everyone pay full price for the cache to protect against a case
 * that never happened. We therefore keep the reported value AS LONG AS IT IS
 * PLAUSIBLE, and we cut it as soon as it is no longer.
 *
 * PUR module — no IO, no `server-only`: this is what makes it testable
 * line by line, and this is where the invariants live that a test must break.
 */

/** No single call earns more tokens than that. An order of magnitude
 * above the largest published context windows. */
export const MAX_USAGE_TOKENS = 10_000_000;

/** HARD ceiling of a line, unknown rate included: an LLM call at the most expensive rate on the market, with the largest window, remains far below. */
export const MAX_USAGE_COST_USD = 100;

/** The margin that we leave for the supplier's figure above our calculation.
 * It absorbs what the displayed price does not say: routing surcharge,
 * reasoning tokens invoiced separately, rounded. */
export const USAGE_COST_TOLERANCE = 2;

/** Below this amount, there is no cap: on a line of a few
 * thousandths of a dollar, the relative tolerance no longer measures anything. */
export const USAGE_COST_FLOOR_USD = 0.05;

/** What the OpenRouter index knows about a model's price. */
export interface UsageModelPricing {
  pricing: ModelPricing | null;
  cachePricing: { readUsdPerMTok: number; writeUsdPerMTok: number } | null;
}

/** The counters of a line, once verified. */
export interface UsageTokens {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  cacheWriteTokens: number | null;
}

export type UsageClaimVerdict =
  | { ok: false; reason: string }
  | (UsageTokens & {
      ok: true;
      cost: number | null;
      estimated: boolean;
      /** The reported amount, when it was replaced by ours. */
      clampedFrom?: number;
    });

/** `ai_usage.cost` is a `numeric(12,6)`: we round where the column cuts. */
function roundUsd(usd: number): number {
  return Math.round(usd * 1e6) / 1e6;
}

/**
 * A token counter, or `null` when not announced. `undefined` says
 * “refused” — a PRESENT but impossible counter is not an absence: treating it as such would let the line pass with one counter less, therefore
 * a lower calculated ceiling, so nothing gained.
 */
function tokenField(raw: unknown): number | null | undefined {
  if (raw == null) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  if (raw < 0 || raw > MAX_USAGE_TOKENS) return undefined;
  return Math.round(raw);
}

/**
 * What this call MAY cost at maximum, reported tokens × published price.
 *
 * Surcharge assumed: cache tokens are counted IN ADDITION to the prompt (they are often already included) and the cache write at the more expensive of the two prices.
 * We are looking for a terminal, not an invoice — too tight an increase would cut honest lines, and that is the only risk that counts here.
 *
 * `null` when the price of the model is unknown (excluding the OpenRouter catalog, BYOK
 * generic): we cannot guess a price, and only the terminals Hard rules apply.
 */
export function maxPlausibleCostUsd(
  tokens: UsageTokens,
  price: UsageModelPricing | null,
): number | null {
  const pricing = price?.pricing;
  if (!pricing) return null;
  const prompt = tokens.promptTokens ?? 0;
  const completion = tokens.completionTokens ?? 0;
  const cacheWrite = tokens.cacheWriteTokens ?? 0;
  const writeRate = Math.max(
    price?.cachePricing?.writeUsdPerMTok ?? 0,
    pricing.inputUsdPerMTok,
  );
  const usd =
    (prompt / 1_000_000) * pricing.inputUsdPerMTok +
    (completion / 1_000_000) * pricing.outputUsdPerMTok +
    (cacheWrite / 1_000_000) * writeRate;
  return roundUsd(usd);
}

/**
 * The usage line that the VM proposes, checked then bounded.
 *
 * `estimated` of the VM is kept when the line passes as is; it is
 * FORCED when we have replaced the amount, because the written figure then comes from
 * our calculation and not from a statement — the finance admin must never confuse the two
 * (same rule as `abandonedSpend`).
 */
export function checkUsageClaim(
  body: Record<string, unknown>,
  price: UsageModelPricing | null,
): UsageClaimVerdict {
  const promptTokens = tokenField(body.promptTokens);
  const completionTokens = tokenField(body.completionTokens);
  const totalTokens = tokenField(body.totalTokens);
  const cachedTokens = tokenField(body.cachedTokens);
  const cacheWriteTokens = tokenField(body.cacheWriteTokens);
  if (
    promptTokens === undefined ||
    completionTokens === undefined ||
    totalTokens === undefined ||
    cachedTokens === undefined ||
    cacheWriteTokens === undefined
  ) {
    return { ok: false, reason: "token counts must be finite, positive and plausible" };
  }
  const tokens: UsageTokens = {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    cacheWriteTokens,
  };

  const rawCost = body.cost;
  if (rawCost != null && (typeof rawCost !== "number" || !Number.isFinite(rawCost))) {
    return { ok: false, reason: "cost must be a finite number" };
  }
  // THE SIGN, and that's the whole ticket: a negative amount does not limit a
  // spend, it deletes another one. The refusal is clear, never a `Math.max(0, …)`
  // silent — a VM that posts this has a problem that we want to see.
  if (typeof rawCost === "number" && rawCost < 0) {
    return { ok: false, reason: "cost cannot be negative" };
  }
  if (typeof rawCost === "number" && rawCost > MAX_USAGE_COST_USD) {
    return { ok: false, reason: `cost exceeds the per-call ceiling ($${MAX_USAGE_COST_USD})` };
  }

  const estimated = body.estimated === true;
  if (typeof rawCost !== "number") {
    return { ok: true, ...tokens, cost: null, estimated };
  }

  /**
 * AN AMOUNT WITHOUT TOKENS IS NOT VERIFIABLE, and this is the hole that the
 * continuation would open if we let it pass: without a counter, the upper bound is worth zero, so
 * capping would write 0 on an honest line (money spent and never
 * counted), and would not not capping would offer those who omit their tokens the full hard cap
 *. Neither is okay. A supplier statement ALWAYS has its
 * tokens next to its amount: above the floor, it is required.
 */
  const hasTokens =
    tokens.promptTokens != null || tokens.completionTokens != null || tokens.totalTokens != null;
  if (rawCost > USAGE_COST_FLOOR_USD && !hasTokens) {
    return { ok: false, reason: "a cost above the floor must come with its token counts" };
  }

  const computed = hasTokens ? maxPlausibleCostUsd(tokens, price) : null;
  const ceiling =
    computed === null ? null : Math.max(computed * USAGE_COST_TOLERANCE, USAGE_COST_FLOOR_USD);
  if (ceiling !== null && rawCost > ceiling) {
    return {
      ok: true,
      ...tokens,
      cost: computed ?? 0,
      estimated: true,
      clampedFrom: rawCost,
    };
  }
  return { ok: true, ...tokens, cost: roundUsd(rawCost), estimated };
}
