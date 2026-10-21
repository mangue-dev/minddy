import "server-only";

import { ERROR_TRACKING_FLAG, isErrorTrackingFlagOn } from "@/lib/error-tracking-flag";
import { posthogCookieName, readPosthogDistinctId } from "@/lib/posthog-cookie";
import { DatabaseOperationError } from "@/lib/server/failure-diagnostics";
import {
  getServerPostHog,
  sanitizeServerProperties,
} from "@/lib/server/posthog";

/**
 * Server-side error reporting to PostHog (MIN-542).
 *
 * Next.js calls the `onRequestError` hook (exported by `instrumentation.ts`)
 * for every error it handles in the Node runtime — route handlers, server
 * actions, RSC rendering. This module turns that hook into an `$exception`
 * event on the SAME PostHog project the analytics already use, so no second
 * vendor, key, or consent surface exists.
 *
 * Gating, in order of cheapness:
 *
 * 1. the explicit opt-in flag (`MINDDY_PUBLIC_ERROR_TRACKING=1`, default OFF
 *    — see `lib/error-tracking-flag.ts`);
 * 2. `getServerPostHog()`, which itself refuses to exist without a full
 *    PostHog key/host pair or on a local environment without the localhost
 *    escape hatch. Self-hosted instances that never opted into PostHog report
 *    nothing, exactly as they do for analytics.
 *
 * Minimization: only template facts and structural database failure metadata
 * leave — never the concrete URL, query, headers, or database response text. The
 * `distinct_id` comes from the browser's PostHog cookie when present, and no
 * person profile is created for it.
 *
 * Reliability: `captureExceptionImmediate` bypasses the client buffer and is
 * awaited — a serverless function may freeze as soon as the hook returns, and
 * a buffered exception would die with it. Failures are swallowed: tracking
 * must never compound the error it reports.
 */

export function isErrorTrackingEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return isErrorTrackingFlagOn(env[ERROR_TRACKING_FLAG]);
}

/**
 * Extract the PostHog `distinct_id` from a raw `Cookie` header, or `null`.
 *
 * The browser only writes its `ph_<public-key>_posthog` cookie after ACCEPTING
 * cookies (see `components/posthog-init.tsx`), so absence is the ordinary case
 * — the exception then travels under no identity rather than an invented one.
 * Value parsing is delegated to `lib/posthog-cookie.ts` (MIN-292), which
 * validates and bounds what comes from the client.
 */
export function parsePostHogDistinctId(
  cookieHeader: string | string[] | undefined | null,
): string | null {
  const raw = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  if (!raw) return null;
  const cookieName = posthogCookieName(process.env.MINDDY_PUBLIC_POSTHOG_KEY);
  if (!cookieName) return null;
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== cookieName) continue;
    return readPosthogDistinctId(part.slice(separator + 1).trim());
  }
  return null;
}

/**
 * A client that leaves mid-response (navigation, cancelled prefetch, closed
 * tab) is not a server failure (MIN-763). Next.js 16.4 aborts an RSC render
 * with `ResponseAborted` and drops it before `onRequestError`; up to 16.3,
 * React's generic `The destination stream closed early.` reached the hook
 * instead and produced hundreds of events a week. Both shapes, and the
 * standard `AbortError`, are filtered here so a framework change cannot bring
 * the noise back.
 */
const CLIENT_ABORT_NAMES = new Set(["AbortError", "ResponseAborted"]);
const CLIENT_ABORT_MESSAGES = new Set(["The destination stream closed early."]);

export function isClientAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return CLIENT_ABORT_NAMES.has(error.name) || CLIENT_ABORT_MESSAGES.has(error.message);
}

export interface ServerErrorContext {
  routePath?: string;
  routeType?: string;
  httpMethod?: string;
  revalidateReason?: string;
}

export async function captureServerException(
  error: unknown,
  cookieHeader: string | string[] | undefined | null,
  context: ServerErrorContext = {},
): Promise<void> {
  if (!isErrorTrackingEnabled()) return;
  if (isClientAbortError(error)) return;
  const posthog = getServerPostHog();
  if (!posthog) return;
  try {
    // `sanitizeServerProperties` runs the shared sanitizer first (reserved `$`
    // keys are stripped) and then keeps exactly one exception: the explicit
    // `$process_person_profile: false` below.
    const properties = sanitizeServerProperties({
      route_path: context.routePath,
      route_type: context.routeType,
      http_method: context.httpMethod,
      revalidate_reason: context.revalidateReason,
      ...(error instanceof DatabaseOperationError ? {
        failure_kind: error.diagnostics.kind,
        failure_code: error.diagnostics.code,
        failure_status: error.diagnostics.status,
      } : {}),
      // Attach to the visitor's PostHog identity without creating a person
      // profile — an anonymous cookie id must not spawn one (same rule as
      // the anonymous public-upload analytics events).
      $process_person_profile: false,
    });
    await posthog.captureExceptionImmediate(
      error,
      parsePostHogDistinctId(cookieHeader) ?? undefined,
      properties,
    );
  } catch {
    // A tracking failure must never compound the error being reported.
  }
}
