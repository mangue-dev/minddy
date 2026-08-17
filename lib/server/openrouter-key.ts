import "server-only";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * Le plafond mensuel de la clé minddy (MIN-92).
 *
 * Le risque n'est PAS de tomber à court de crédits — l'auto-refill OpenRouter
 * est actif au niveau du compte. Le vrai risque est de SATURER LE PLAFOND de la
 * clé et de voir Numo, la dictée et le traitement du feedback s'arrêter net
 * jusqu'au mois suivant.
 *
 * ⚠️ `GET /api/v1/auth/key` renvoie les compteurs DE LA CLÉ. À ne pas confondre
 * avec `GET /api/v1/credits`, qui agrège le compte ENTIER, toutes clés
 * mélangées : inutilisable pour piloter minddy.
 */

const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/auth/key";
const REQUEST_TIMEOUT_MS = 5_000;

export interface OpenRouterKeyStatus {
  /** Plafond en USD sur la période. `null` = clé sans plafond. */
  limit: number | null;
  /** Consommé sur la période du plafond, en USD. */
  usage: number;
  /** Reste à consommer, en USD. `null` quand il n'y a pas de plafond. */
  remaining: number | null;
  /** `monthly`, `daily`… tel que rapporté par OpenRouter. */
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
 * L'état du plafond, ou `null` si on n'a pas pu le lire (clé absente, OpenRouter
 * injoignable). Ne lève jamais : ni la page Finances ni le cron du garde-fou ne
 * doivent tomber parce qu'un appel externe a échoué — l'écran affiche
 * simplement la tuile en « indisponible ».
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
    // `limit_reset: monthly` → `usage_monthly` est le compteur qui compte face au
    // plafond ; `usage` est le cumul depuis la création de la clé.
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
