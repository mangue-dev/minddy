/**
 * The error-tracking opt-in flag (MIN-542).
 *
 * Exceptions may leave for PostHog only when the operator explicitly sets
 * `MINDDY_PUBLIC_ERROR_TRACKING=1` — the default (absent variable) is OFF,
 * self-hosted included. Parsing lives in this dependency-free module because
 * three unrelated call sites need the same reading:
 *
 * - `lib/runtime-config.ts` (browser projection of the runtime config);
 * - `lib/server/posthog.ts` (process-level exception autocapture);
 * - `lib/server/error-tracking.ts` (the `onRequestError` reporting hook).
 *
 * The flag gates the WHAT (exceptions), not the WHO: the PostHog key pairs
 * remain the master switch, so without them nothing leaves either way.
 */
export const ERROR_TRACKING_FLAG = "MINDDY_PUBLIC_ERROR_TRACKING";

export function isErrorTrackingFlagOn(value: string | undefined | null): boolean {
  return value === "1";
}
