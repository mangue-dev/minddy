import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Change USD → EUR (MIN-92) — la table `fx_rates`, une ligne par jour.
 *
 * Les coûts arrivent en USD (OpenRouter), le revenu est déjà en EUR : seule la
 * colonne coûts se convertit. La source est Frankfurter, qui republie les taux
 * de référence de la BCE — gratuit, sans clé, et c'est LA référence comptable en
 * zone euro.
 *
 * Le taux n'est jamais lu dans le chemin d'une requête : un appel externe au
 * rendu d'une page, c'est de la latence et un point de panne pour rien. C'est le
 * cron quotidien (`app/api/cron/fx-rate/route.ts`) qui alimente la table, et la
 * RPC `get_ai_cost_daily` qui joint chaque coût au taux de SA journée.
 */

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

/** Fenêtre couverte à chaque passage : la plus large que montre l'écran. */
export const FX_SYNC_WINDOW_DAYS = 90;

/**
 * Marge amont demandée à Frankfurter. La BCE ne publie que les jours ouvrés :
 * si la fenêtre démarre un samedi, il faut un jour ouvré AVANT elle pour avoir
 * quelque chose à reporter sur ces premières journées. Une semaine couvre les
 * ponts les plus longs.
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
 * Les jours ouvrés publiés par la BCE sur une plage. Renvoie `null` si l'appel
 * échoue : l'appelant n'écrit alors RIEN et le dernier taux connu continue de
 * servir — une page de finances ne tombe pas pour un problème de change.
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
 * Remplit `fx_rates` sur la fenêtre. Un SEUL appel réseau : Frankfurter sait
 * renvoyer une plage entière, ce qui règle d'un coup le premier amorçage (table
 * vide) et les trous laissés par un cron manqué — inutile de traiter ces deux
 * cas séparément.
 *
 * Les journées non ouvrées (week-ends, fériés) reçoivent le dernier taux publié,
 * pour qu'aucune journée ne manque à la jointure de `get_ai_cost_daily`.
 *
 * Les lignes DÉJÀ écrites ne sont jamais réécrites : l'historique est définitif.
 * C'est tout l'intérêt d'historiser plutôt que de recalculer.
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

  // Report : on balaie les jours dans l'ordre en gardant le dernier taux publié.
  // Le pas de recul garantit qu'un taux est déjà en main avant `from`.
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
 * Le taux le plus récent en base, avec SA date. L'écran affiche les deux : un
 * montant converti sans son taux n'est pas vérifiable, et la date rend visible
 * un cron en panne.
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
