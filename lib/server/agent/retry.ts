/**
 * Résilience réseau de la boucle agentique (MIN-46). Logique de classification /
 * backoff PURE et testable, séparée du streaming. Un run ne doit pas mourir sur un
 * simple 429/5xx OpenRouter ou un stream figé.
 */

/** Nombre max de tentatives d'un appel de complétion (1 essai + N reprises). */
export const MAX_STREAM_ATTEMPTS = 4;
/** Timeout d'inactivité : aucun octet SSE reçu pendant ce délai → on avorte + retry. */
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

/**
 * Ce qu'une REPRISE d'appel modèle doit trouver devant elle pour être tentée
 * (MIN-214). Dérivé du timeout d'inactivité, et pas posé à côté : un essai qui ne
 * rend pas un octet est coupé là, donc c'est exactement ce qu'il faut avoir pour
 * s'en offrir un et rester capable d'écrire son checkpoint après.
 *
 * La garde ne portait que sur le SOMMEIL : on dormait 500 ms, on repartait avec 2 s
 * de budget pour un appel qui peut en prendre 210, et la fonction mourait avant le
 * checkpoint — chunk entier perdu. Elle ne s'applique qu'au point de REPRISE : le
 * premier essai part toujours, sinon un chunk court suspendrait sans rien faire et
 * se re-queuerait indéfiniment (le zombie fermé par MIN-213).
 */
export const MIN_STREAM_ATTEMPT_MS = STREAM_IDLE_TIMEOUT_MS;

const RETRY_BASE_MS = 500;
const RETRY_CAP_MS = 8_000;
/** Plafond DUR d'une attente de reprise (même si Retry-After demande beaucoup plus).
    Au-delà, mieux vaut suspendre le run que dormir et se faire tuer par maxDuration. */
export const MAX_RETRY_WAIT_MS = 30_000;

/**
 * Reprise ENTRE CHUNKS d'une panne de fournisseur (MIN-219) — l'étage au-dessus
 * du backoff ci-dessus, qui ne couvre qu'UN appel (4 essais, ≤ 3,5 s d'attente
 * cumulée). Passé ça, la boucle suspend le chunk et l'exécuteur re-queue : c'est
 * ce délai-là qui décide de la patience RÉELLE du tour face à une panne.
 *
 * Il valait zéro. Le re-queue était immédiat, le drain reclaimait dans le même
 * process, et une panne de deux minutes brûlait les 20 continuations du tour en
 * autant de chunks morts sur leur premier appel — puis le tour s'arrêtait sur
 * « limite de durée », la seule phrase que ce plafond savait dire.
 *
 * Les paliers : de quoi traverser un incident ordinaire (quelques dizaines de
 * secondes) sans y penser, et ~17,5 min de patience au total avant d'abandonner
 * proprement. La microVM vit 45 min (`SANDBOX_TIMEOUT_MS`) et le tour 60
 * (`MAX_WALL_CLOCK_MS`) : les deux filets restent devant. Au-delà, le repos est
 * un meilleur service qu'une attente — le checkpoint est gardé, un message
 * suffit à repartir.
 *
 * Le cron de drain passe toutes les 2 min : un délai plus fin que ça se lit
 * comme « au prochain passage ». C'est voulu — le premier palier sert surtout à
 * ne PAS retenter dans la foulée.
 */
const PROVIDER_REQUEUE_DELAYS_MS = [30_000, 120_000, 300_000, 600_000];

/** Nombre de re-queues différés accordés à une panne avant le repos honnête. */
export const MAX_PROVIDER_REQUEUES = PROVIDER_REQUEUE_DELAYS_MS.length;

/** Ce qu'un chunk tombé sur une panne fait ensuite. `retries` est le compteur à
 *  reporter dans le checkpoint re-queué — il ne repart de zéro que par le haut,
 *  quand un chunk avance et repose un checkpoint sans lui. */
export type ProviderStallPlan =
  | { requeue: true; retries: number; delayMs: number }
  | { requeue: false; retries: number };

/**
 * La décision, à partir du seul compteur porté par le checkpoint précédent.
 * PURE — c'est ici que se teste la politique, pas dans `execute.ts` où elle
 * n'était atteignable qu'avec une microVM, une base et un modèle.
 *
 * `Math.max(0, …)` sur l'entrée : le checkpoint vient de la base, et un compteur
 * négatif (ligne bricolée à la main, migration) rendrait un délai indéfini —
 * donc un `not_before` dans le passé, c'est-à-dire le défaut qu'on ferme.
 */
export function planProviderStall(previousRetries: number): ProviderStallPlan {
  const retries = Math.max(0, Math.floor(previousRetries) || 0) + 1;
  if (retries > MAX_PROVIDER_REQUEUES) return { requeue: false, retries };
  return { requeue: true, retries, delayMs: PROVIDER_REQUEUE_DELAYS_MS[retries - 1]! };
}

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
