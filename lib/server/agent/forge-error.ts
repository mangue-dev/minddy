/**
 * Error raised by a forge API call (GitHub or GitLab). It carries the HTTP
 * status and, when the forge throttles, its `Retry-After` value, which the
 * PR routes forward to the browser.
 *
 * This module imports nothing so that `pr.ts`, `mr.ts` and `forge.ts` can all
 * extend or test it without an import cycle.
 */
export class ForgeApiError extends Error {
  status: number;
  retryAfter?: string | null;
  constructor(message: string, status: number, retryAfter?: string | null) {
    super(message);
    this.name = "ForgeApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function isForgeApiError(err: unknown): err is ForgeApiError {
  return err instanceof ForgeApiError;
}
