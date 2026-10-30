import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { AdminCostRow, AdminFinance } from "@/lib/types";

/**
 * Cost tracking of the instance (MIN-92, MIN-829): the AI ledger aggregated
 * per day, feature and model, over the chosen window and the one
 * before it. The Costs tab filters and charts it on the client. Revenue, MRR,
 * margin and the key caps left with the commercial dashboard.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  payload: AdminFinance;
  expiresAt: number;
}
const cache = new Map<number, CacheEntry>();

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getFinanceSummary(options: {
  days: number;
  refresh?: boolean;
}): Promise<AdminFinance> {
  const windowDays = Math.max(1, Math.min(365, options.days));

  if (!options.refresh) {
    const cached = cache.get(windowDays);
    if (cached && cached.expiresAt > Date.now()) return cached.payload;
  }

  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const windowStart = new Date(today - (windowDays - 1) * 86_400_000);
  // The breakdown also covers the window before, for the “vs previous
  // period” comparisons.
  const since = new Date(windowStart.getTime() - windowDays * 86_400_000);

  const { data, error } = await getServiceClient().rpc("get_ai_cost_breakdown", {
    p_since: since.toISOString(),
    p_tz: "UTC",
  });
  if (error) throw new Error(error.message);
  const breakdown: AdminCostRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    day: String(row.day),
    feature: String(row.feature),
    model: String(row.model ?? ""),
    costUsd: Number(row.cost_usd) || 0,
    calls: Number(row.calls) || 0,
    promptTokens: Number(row.prompt_tokens) || 0,
    completionTokens: Number(row.completion_tokens) || 0,
    cachedTokens: Number(row.cached_tokens) || 0,
  }));

  const payload: AdminFinance = {
    windowDays,
    windowStartDay: isoDay(windowStart),
    breakdown,
    fetchedAt: new Date().toISOString(),
  };
  cache.set(windowDays, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
  return payload;
}
