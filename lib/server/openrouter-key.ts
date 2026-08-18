import "server-only";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * The monthly limit of the minddy key (MIN-92).
 *
 * The risk is NOT to run out of credits — OpenRouter
 * auto-refill is active at the account level. The real risk is to SATURATING THE CEILING of the
 * key and seeing Numo, dictation and feedback processing stop dead
 * until the following month.
 *
 * ⚠️ `GET /api/v1/auth/key` returns the counters OF THE KEY. Do not confuse
 * with `GET /api/v1/credits`, which aggregates the ENTIRE account, all keys
 * mixed: unusable to control minddy.
 */

const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/auth/key";
const REQUEST_TIMEOUT_MS = 5_000;

export interface OpenRouterKeyStatus {
  /** Ceiling in USD over the period. `null` = key without cap. */
  limit: number | null;
  /** Consumed over the cap period, in USD. */
  usage: number;
  /** Remains to be consumed, in USD. `null` when there is no cap. */
  remaining: number | null;
  /** `monthly`, `daily`… as reported by OpenRouter. */
  limitReset: string | null;
  usageDaily: number;
  usageWeekly: number;
}

interface AuthKeyResponse {
  data?: {
    limit?: number | null;
    limit_remaining?: number | null;
    limit_reset?: string | null;
    usage?: number;
    usage_daily?: number;
    usage_weekly?: number;
    usage_monthly?: number;
  };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The state of the ceiling, or `null` if we could not read it (key absent, OpenRouter
 * unreachable). Never raises: neither the Finances page nor the guardrail cron should drop because an external call failed — the screen simply shows the tile as "unavailable".
 */
export async function fetchOpenRouterKeyStatus(): Promise<OpenRouterKeyStatus | null> {
  if (!isManagedAiEnabled()) return null;
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_KEY_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(`[openrouter-key] refusé (HTTP ${response.status})`);
      return null;
    }
    const payload = (await response.json()) as AuthKeyResponse;
    const data = payload.data;
    if (!data) return null;

    const limit =
      typeof data.limit === "number" && Number.isFinite(data.limit)
        ? data.limit
        : null;
    // `limit_reset: monthly` → `usage_monthly` is the counter that counts against the
    // ceiling ; `usage` is the total since the key was created.
    const usage =
      data.limit_reset === "monthly" ? num(data.usage_monthly) : num(data.usage);

    return {
      limit,
      usage,
      remaining:
        typeof data.limit_remaining === "number" &&
        Number.isFinite(data.limit_remaining)
          ? data.limit_remaining
          : limit === null
            ? null
            : Math.max(limit - usage, 0),
      limitReset: data.limit_reset ?? null,
      usageDaily: num(data.usage_daily),
      usageWeekly: num(data.usage_weekly),
    };
  } catch (err) {
    console.error("[openrouter-key] injoignable :", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
