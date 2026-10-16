import { MFA_REQUIRED_CODE } from "./mfa";

/** Why a read failed, in the terms a screen explains it to the reader. */
export type ReadFailureKind =
  | "signedOut"
  | "secondFactor"
  | "forbidden"
  | "notFound"
  | "rateLimited"
  | "unavailable";

type FailureFields = { status?: unknown; code?: unknown; retryAt?: unknown };

/**
 * Classify a failed read from the status, API code and Retry-After deadline
 * that `ApiError` and `HttpResponseError` carry. Anything without a status
 * (timeout, network, invalid body) is a temporary unavailability.
 */
export function readFailureKind(error: unknown): ReadFailureKind {
  const { status, code } = (error ?? {}) as FailureFields;
  if (status === 429 || (status === 403 && readFailureRetryAt(error) > 0)) return "rateLimited";
  if (status === 401) return "signedOut";
  if (status === 403) return code === MFA_REQUIRED_CODE ? "secondFactor" : "forbidden";
  if (status === 404) return "notFound";
  return "unavailable";
}

/** The Retry-After deadline (epoch ms) of a rate-limited read, or 0. */
export function readFailureRetryAt(error: unknown): number {
  const retryAt = (error as FailureFields | null)?.retryAt;
  return typeof retryAt === "number" && Number.isFinite(retryAt) ? retryAt : 0;
}
