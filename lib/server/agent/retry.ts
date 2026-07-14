/**
 * Résilience réseau de la boucle agentique (MIN-46). Logique de classification /
 * backoff PURE et testable, séparée du streaming. Un run ne doit pas mourir sur un
 * simple 429/5xx OpenRouter ou un stream figé.
 */

/** Nombre max de tentatives d'un appel de complétion (1 essai + N reprises). */
export const MAX_STREAM_ATTEMPTS = 4;
/** Timeout d'inactivité : aucun octet SSE reçu pendant ce délai → on avorte + retry. */
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

const RETRY_BASE_MS = 500;
const RETRY_CAP_MS = 8_000;
/** Plafond DUR d'une attente de reprise (même si Retry-After demande beaucoup plus).
    Au-delà, mieux vaut suspendre le run que dormir et se faire tuer par maxDuration. */
export const MAX_RETRY_WAIT_MS = 30_000;

/** Erreur de streaming portant l'info de reprise. */
export class StreamError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;
  constructor(
    message: string,
    opts: { retryable: boolean; status?: number; retryAfterMs?: number },
  ) {
    super(message);
    this.name = "StreamError";
    this.retryable = opts.retryable;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/** Statut HTTP reprenable : 429 (rate limit) ou 5xx (serveur). */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Détecte un 400 « contexte trop long » à partir du corps d'erreur du provider.
 * PURE et insensible à la casse : distingue un dépassement de fenêtre de contexte
 * (récupérable en élaguant l'historique) d'un autre 400 (requête invalide, etc.).
 * Couvre les tournures courantes des providers OpenAI-compatibles.
 */
export function isContextLengthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("context length") ||
    m.includes("maximum context") ||
    m.includes("context window") ||
    m.includes("context_length_exceeded") ||
    m.includes("too many tokens") ||
    m.includes("reduce the length") ||
    m.includes("input is too long") ||
    m.includes("prompt is too long") ||
    // « maximum ... tokens » (ex. « the maximum is 4096 tokens ») — écart borné.
    /maximum[\s\S]{0,80}?tokens/.test(m)
  );
}

/** Parse un header `Retry-After` (secondes OU date HTTP) en ms, ou null. */
export function parseRetryAfterMs(header: string | null | undefined, nowMs: number): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  const secs = Number(trimmed);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) return Math.max(0, date - nowMs);
  return null;
}

/** Backoff exponentiel plafonné, avec jitter (±10 %). `rand` injectable pour les tests. */
export function backoffMs(attempt: number, rand = Math.random()): number {
  const base = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt);
  return Math.round(base * (0.9 + rand * 0.2));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
