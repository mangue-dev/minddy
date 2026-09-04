const RETRYABLE_ERROR_NAMES = new Set([
  "AbortError",
  "AuthRetryableFetchError",
  "TimeoutError",
]);

const RETRYABLE_MESSAGE_PATTERNS = [
  /failed to fetch/i,
  /fetch failed/i,
  /network request failed/i,
  /networkerror/i,
  /timed? out/i,
];

export const SERVER_UNAVAILABLE_PATH = "/server-unavailable";
export const BACKEND_REQUEST_TIMEOUT_MS = 8_000;

/** An HTTP failure that keeps its status after a client API response is parsed. */
export class HttpResponseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HttpResponseError";
  }
}

/** True for temporary transport and upstream failures, not normal auth errors. */
export function isBackendUnavailableError(error: unknown, depth = 0): boolean {
  if (!error || depth > 2) return false;
  if (typeof error !== "object") return false;

  const candidate = error as {
    cause?: unknown;
    message?: unknown;
    name?: unknown;
    status?: unknown;
  };

  if (
    typeof candidate.status === "number" &&
    candidate.status >= 500 &&
    candidate.status <= 599
  ) {
    return true;
  }
  if (
    typeof candidate.name === "string" &&
    RETRYABLE_ERROR_NAMES.has(candidate.name)
  ) {
    return true;
  }
  const message = candidate.message;
  if (
    typeof message === "string" &&
    RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return true;
  }

  return isBackendUnavailableError(candidate.cause, depth + 1);
}

/** Adds a hard deadline while preserving any abort signal supplied by the caller. */
export const backendFetchWithTimeout: typeof fetch = (input, init) => {
  const signals: AbortSignal[] = [AbortSignal.timeout(BACKEND_REQUEST_TIMEOUT_MS)];
  if (input instanceof Request) signals.push(input.signal);
  if (init?.signal) signals.push(init.signal);

  return fetch(input, {
    ...init,
    signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals),
  });
};
