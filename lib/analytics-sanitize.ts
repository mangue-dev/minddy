/**
 * Last defense before sending to PostHog (MIN-78).
 *
 * The typed catalog (`lib/analytics-events.ts`) already prevents inventing an event name
 * or an out-of-contract prop AT COMPILATION. These functions cover
 * what typing cannot see: a runtime-calculated VALUE that
 * would be too long user text, a nested object, a `NaN`, or a
 * `$` * prefixed key that would override a reserved property of PostHog.
 *
 * Basic rule: we only send METADATA (counters, booleans, enums,
 * ids, length slices). Never a ticket title, a comment, nor a
 * message addressed to Numo.
 */

/** Max length of a text value — well beyond any legitimate enum. */
const MAX_STRING_LENGTH = 512;
/** Beyond that, we are trying to serialize an entire business object. */
const MAX_PROP_KEYS = 24;
const MAX_EVENT_NAME_LENGTH = 64;

/** snake_case (plus `:` and `-`), the catalog naming format. */
const SAFE_KEY_PATTERN = /^[a-z0-9_:-]+$/;

/** Control characters (including \n, \t) — replaced by a space. */
// The purpose of this constant IS to match control characters.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** Neutralizes control characters and bounds the length. */
function clampText(value: string, maxLength: number): string {
  return value.replace(CONTROL_CHARS, " ").trim().slice(0, maxLength);
}

/**
 * Normalizes an event name, or returns "" if it is unusable — the caller
 * (`useAnalytics().track`) then aborts sending rather than creating a spurious event definition in PostHog.
 */
export function sanitizeAnalyticsEventName(value: unknown): string {
  if (typeof value !== "string") return "";
  const sanitized = clampText(value, MAX_EVENT_NAME_LENGTH).toLowerCase();
  return SAFE_KEY_PATTERN.test(sanitized) ? sanitized : "";
}

/**
 * Keep only safe primitives. Everything else (objects, arrays,
 * functions, `undefined`, `NaN`, `$`-prefixed keys) is SILENTLY discarded:
 * a missing prop is a lesser evil compared to an event rejected by
 * ingestion or a leak of personal data.
 */
export function sanitizeAnalyticsProps(
  value: Record<string, unknown> | undefined
): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object") return {};

  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_PROP_KEYS)) {
    if (typeof rawKey !== "string") continue;
    const key = clampText(rawKey, MAX_EVENT_NAME_LENGTH).toLowerCase();
    if (!key || !SAFE_KEY_PATTERN.test(key)) continue;

    if (typeof rawValue === "string") {
      sanitized[key] = clampText(rawValue, MAX_STRING_LENGTH);
      continue;
    }
    if (typeof rawValue === "number") {
      // NaN/Infinity break JSON serialization on the ingestion side.
      if (Number.isFinite(rawValue)) sanitized[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "boolean") {
      sanitized[key] = rawValue;
      continue;
    }
    // `null` is information ("no value"), `undefined` is not.
    if (rawValue === null) sanitized[key] = null;
  }

  return sanitized;
}

/**
 * Length slice of free text, to measure usage WITHOUT sending the
 * content. To be used wherever you would be tempted to track a message
 * (comment, Numo prompt, feedback from the public board).
 */
export function lengthBucket(text: string | null | undefined): string {
  const length = text?.length ?? 0;
  if (length === 0) return "empty";
  if (length <= 40) return "xs";
  if (length <= 140) return "s";
  if (length <= 500) return "m";
  if (length <= 2000) return "l";
  return "xl";
}

/** Same idea for a duration in milliseconds (agent runs, Numo responses). */
export function durationBucket(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  if (ms < 1_000) return "under_1s";
  if (ms < 5_000) return "1_5s";
  if (ms < 30_000) return "5_30s";
  if (ms < 120_000) return "30s_2m";
  if (ms < 600_000) return "2_10m";
  return "over_10m";
}

/**
 * Reduces an error to a stable CATEGORY, never its raw message.
 *
 * An error message can contain an email address, an identifier or a
 * request fragment; it also changes with each update of the provider, this
 * which fragments the statistics. So we map the known cases to a handful
 * of values, and everything else to `unknown` — more than enough to know
 * *why* people can't connect.
 */
export function errorReason(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (!message) return "unknown";
  if (message.includes("invalid login credentials")) return "invalid_credentials";
  if (message.includes("email not confirmed")) return "email_not_confirmed";
  if (message.includes("already registered") || message.includes("already exists")) {
    return "user_already_exists";
  }
  if (message.includes("password should be")) return "weak_password";
  if (message.includes("for security purposes") || message.includes("rate limit")) {
    return "rate_limited";
  }
  if (message.includes("email address") && message.includes("invalid")) return "invalid_email";
  if (message.includes("captcha")) return "captcha_failed";
  if (message.includes("fetch") || message.includes("network")) return "network";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (message.includes("provider is not enabled")) return "provider_disabled";
  return "unknown";
}

/** And for a file size in bytes (attachments). */
export function sizeBucket(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < 100_000) return "under_100kb";
  if (bytes < 1_000_000) return "100kb_1mb";
  if (bytes < 5_000_000) return "1_5mb";
  return "over_5mb";
}
