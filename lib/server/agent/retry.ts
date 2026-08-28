/**
 * Network resiliency of the agentic loop (MIN-46). Classification logic /
 * PURE and testable backoff, separate from streaming. A run must not die on a simple 429/5xx OpenRouter or frozen stream.
 */

/** Max number of attempts for a completion call (1 try + N attempts). */
export const MAX_STREAM_ATTEMPTS = 4;
/** Inactivity timeout: no SSE byte received during this time → abort + retry. */
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

/**
 * What a model call RESUME must find in front of it to be attempted
 * (MIN-214). Derived from the inactivity timeout, and not placed next to it: a test which does not
 * return a byte is cut there, so it is exactly what you need to have to
 * get one and remain able to write your checkpoint afterwards.
 *
 * The guard only concerned SLEEP: we were asleep 500 ms, we left with 2 s
 * of budget for a call which can take 210, and the function died before the
 * checkpoint — entire chunk lost. It only applies at the RESUME point: the
 * first try always leaves, otherwise a short chunk would suspend without doing anything and
 * would re-queue indefinitely (the zombie closed by MIN-213).
 */
export const MIN_STREAM_ATTEMPT_MS = STREAM_IDLE_TIMEOUT_MS;

const RETRY_BASE_MS = 500;
const RETRY_CAP_MS = 8_000;
/** HARD ceiling of a resumption wait (even if Retry-After requires much more).
 Beyond that, it is better to suspend the run than to sleep and be killed by maxDuration. */
export const MAX_RETRY_WAIT_MS = 30_000;

/**
 * BETWEEN CHUNKS recovery from a provider outage (MIN-219) — the stage above
 * of the backoff above, which only covers ONE call (4 tries, ≤ 3.5 sec wait
 * cumulative). After that, the loop suspends the chunk and the executor queues again: it is
 * this delay which decides the REAL patience of the round in the face of a failure.
 *
 * It was worth zero. The requeue was immediate, the drain reclaimed in the same
 * process, and a two-minute outage burned the 20 continuations of the round into
 * as many chunks died on their first call — then the round stopped on
 * "time limit", the only phrase this cap knew how to say.
 *
 * The levels: enough to get through an ordinary incident (a few dozen
 * seconds) without thinking about it, and ~17.5 min of patience in total before giving up
 * properly. The turn lasts 60 min (`MAX_WALL_CLOCK_MS`) and the microVM much longer
 * (`SANDBOX_TIMEOUT_MS`): the two nets remain in front. Beyond that, rest is
 * a better service than waiting — the checkpoint is guarded, a message
 * is enough to leave.
 *
 * The drain cron runs every 2 min: a delay finer than that reads
 * like "on the next pass". This is intentional — the first level is mainly used to
 * do NOT try again straight away.
 */
const PROVIDER_REQUEUE_DELAYS_MS = [30_000, 120_000, 300_000, 600_000];

/**
 * Bootstrap uses the same recovery window as provider calls. The Sandbox SDK
 * already retries a request twice over roughly one second, but a short platform
 * incident can easily outlive that window. Re-queuing releases the function and
 * retries on a later drain tick instead of turning a transient 5xx into a failed
 * unattended run.
 */
const BOOTSTRAP_REQUEUE_DELAYS_MS = PROVIDER_REQUEUE_DELAYS_MS;

export type BootstrapRetryPlan =
  | { requeue: true; delayMs: number }
  | { requeue: false };

function httpStatusFromError(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    response?: { status?: unknown };
    status?: unknown;
    statusCode?: unknown;
  };
  for (const status of [
    candidate.response?.status,
    candidate.status,
    candidate.statusCode,
  ]) {
    if (typeof status === "number" && Number.isInteger(status)) return status;
  }
  return null;
}

/**
 * Returns a delayed retry only for an observed retryable HTTP response. Generic
 * bootstrap errors remain terminal: invalid repository data, malformed network
 * policy, and other programming/configuration faults must stay visible rather
 * than looping behind a generic error message.
 *
 * `attempts` is incremented atomically by `claim_agent_run`, so attempt one gets
 * the first delay and the fifth retryable failure becomes terminal.
 */
export function planBootstrapRetry(
  error: unknown,
  attempts: number,
): BootstrapRetryPlan | null {
  const status = httpStatusFromError(error);
  if (status == null || !isRetryableStatus(status)) return null;
  const attempt = Math.max(1, Math.floor(attempts) || 1);
  const delayMs = BOOTSTRAP_REQUEUE_DELAYS_MS[attempt - 1];
  return delayMs == null ? { requeue: false } : { requeue: true, delayMs };
}

/** Number of deferred requeues granted to a failure before honest rest. */
export const MAX_PROVIDER_REQUEUES = PROVIDER_REQUEUE_DELAYS_MS.length;

/** What a failed chunk does next. `retries` is the counter to
 * carried over into the re-queued checkpoint — it only starts from zero at the top,
 * when a chunk advances and re-queues a checkpoint without it. */
export type ProviderStallPlan =
  | { requeue: true; retries: number; delayMs: number }
  | { requeue: false; retries: number };

/**
 * The decision, based only on the counter carried by the previous checkpoint.
 * PURE — this is where the policy is tested, not in `execute.ts` where it
 * was only achievable with a microVM, a base and a model.
 *
 * `Math.max(0, …)` on the input: the checkpoint comes from the base, and a negative counter
 * (hand-crafted line, migration) would cause an indefinite delay —
 * therefore a `not_before` in the past, that is to say the default that we closes.
 */
export function planProviderStall(previousRetries: number): ProviderStallPlan {
  const retries = Math.max(0, Math.floor(previousRetries) || 0) + 1;
  if (retries > MAX_PROVIDER_REQUEUES) return { requeue: false, retries };
  return { requeue: true, retries, delayMs: PROVIDER_REQUEUE_DELAYS_MS[retries - 1]! };
}

/** Streaming error carrying resume info. */
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
 * Detects a 400 "context too long" from the provider error body.
 * PURE and case-insensitive: distinguishes a context window overflow
 * (recoverable by pruning the history) from another 400 (invalid request, etc.).
 * Covers common terminology for OpenAI-compatible providers.
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
    // “maximum ... tokens” (e.g. “the maximum is 4096 tokens”) — bounded deviation.
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

/** Capped exponential backoff, with jitter (±10%). `rand` injectable for testing. */
export function backoffMs(attempt: number, rand = Math.random()): number {
  const base = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt);
  return Math.round(base * (0.9 + rand * 0.2));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
