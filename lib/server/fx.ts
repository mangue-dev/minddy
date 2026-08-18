import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Changes USD → EUR (MIN-92) — the `fx_rates` table, one row per day.
 *
 * The costs arrive in USD (OpenRouter), the income is already in EUR: only the
 * costs column converts. The source is Frankfurter, which republishes the ECB's
 * reference rates — free, keyless, and it is THE accounting reference in
 * euro zone.
 *
 * The rate is never read in the path of a request: an external call to the
 * rendering of a page, it's latency and a point of failure for nothing. It is the
 * daily cron (`app/api/cron/fx-rate/route.ts`) which feeds the table, and the
 * RPC `get_ai_cost_daily` which joins each cost to the rate of ITS day.
 */

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

/** Window covered on each pass: the widest shown on the screen. */
export const FX_SYNC_WINDOW_DAYS = 90;

/**
 * Upstream margin requested from Frankfurter. The ECB only publishes on working days:
 * if the window starts on a Saturday, you need a working day BEFORE it to have
 * something to report on these first days. One week covers the longest
 * decks.
 */
const LOOKBACK_DAYS = 7;

const REQUEST_TIMEOUT_MS = 5_000;

export interface FxRate {
  /** Jour calendaire (`YYYY-MM-DD`) auquel ce taux s'applique. */
  day: string;
  usdEur: number;
}

interface FrankfurterRange {
  rates?: Record<string, { EUR?: number }>;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * The working days published by the ECB on a range. Returns `null` if the call
 * fails: the caller then writes NOTHING and the last known rate continues to serve
 * — a finance page does not fall due to a currency exchange problem.
 */
async function fetchFrankfurterRange(
  from: string,
  to: string
): Promise<Map<string, number> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${FRANKFURTER_BASE}/${from}..${to}?base=USD&symbols=EUR`,
      { signal: controller.signal, cache: "no-store" }
    );
    if (!response.ok) {
      console.error(`[fx] Frankfurter a refusé (HTTP ${response.status})`);
      return null;
    }
    const data = (await response.json()) as FrankfurterRange;
    const rates = new Map<string, number>();
    for (const [day, value] of Object.entries(data.rates ?? {})) {
      const eur = value?.EUR;
      if (typeof eur === "number" && Number.isFinite(eur) && eur > 0) {
        rates.set(day, eur);
      }
    }
    return rates.size > 0 ? rates : null;
  } catch (err) {
    console.error("[fx] Frankfurter injoignable :", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Populates `fx_rates` on the window. A SINGLE network call: Frankfurter knows
 * return an entire range, which at once fixes the first boot (empty table
 *) and the holes left by a missed cron — no need to treat these two cases separately.
 *
 * Non-working days (weekends, holidays) receive the last published rate,
 * so that no day is missing at the join of `get_ai_cost_daily`.
 *
 * The lines ALREADY written are never rewritten: the history is definitive.
 * This is the whole point of historicizing rather than recalculate.
 */
export async function syncFxRates(options?: { days?: number }): Promise<{
  ok: boolean;
  inserted: number;
  from: string;
  to: string;
}> {
  const span = Math.max(1, Math.min(365, options?.days ?? FX_SYNC_WINDOW_DAYS));
  const today = new Date();
  const to = isoDay(today);
  const from = isoDay(addDays(today, -(span - 1)));

  const published = await fetchFrankfurterRange(
    isoDay(addDays(today, -(span - 1 + LOOKBACK_DAYS))),
    to
  );
  if (!published) return { ok: false, inserted: 0, from, to };

  const service = getServiceClient();
  const { data: existingRows, error: readError } = await service
    .from("fx_rates")
    .select("day")
    .gte("day", from)
    .lte("day", to);
  if (readError) throw new Error(readError.message);
  const existing = new Set((existingRows ?? []).map((row) => row.day as string));

  // Report: we scan the days in order while keeping the last published rate.
  // The step back guarantees that a rate is already in hand before `from`.
  const publishedDays = [...published.keys()].sort();
  let carried: number | null = null;
  let cursor = 0;

  const rows: Array<{ day: string; usd_eur: number }> = [];
  const start = addDays(today, -(span - 1));
  for (let offset = 0; offset < span; offset++) {
    const day = isoDay(addDays(start, offset));
    while (cursor < publishedDays.length && publishedDays[cursor] <= day) {
      carried = published.get(publishedDays[cursor]) ?? carried;
      cursor++;
    }
    if (carried === null || existing.has(day)) continue;
    rows.push({ day, usd_eur: carried });
  }

  if (rows.length > 0) {
    const { error } = await service.from("fx_rates").insert(rows);
    if (error) throw new Error(error.message);
  }

  return { ok: true, inserted: rows.length, from, to };
}

/**
 * The most recent rate in base, with ITS date. The screen displays both: a
 * converted amount without its rate is not verifiable, and the date makes visible
 * a failed cron.
 */
export async function getLatestFxRate(): Promise<FxRate | null> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("fx_rates")
    .select("day, usd_eur")
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[fx] lecture du dernier taux impossible :", error.message);
    return null;
  }
  if (!data) return null;
  return { day: data.day as string, usdEur: Number(data.usd_eur) };
}
