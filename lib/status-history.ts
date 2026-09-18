// Error history for the bottom-bar status line (MIN-555). When an error toast
// fires, the status line shows it once and then lets it go — this store is the
// memory behind the bell button, so the user can still read what failed after
// the line is gone. Errors live ONLY in the browser's localStorage: no server,
// no DB, capped to a handful of entries (a recovery aid, not a log).
//
// Server-safe by guard: every accessor short-circuits when `window` is absent,
// following the `lib/drafts.ts` pattern.

export interface StatusError {
  /** The sonner toast id that produced the error, stringified. */
  id: string;
  /** The error message as shown in the status line. */
  message: string;
  /** Epoch ms of the last occurrence — drives the most-recent-first order. */
  at: number;
}

/** Keep the list short — this is a reminder, not a history. */
export const MAX_STATUS_ERRORS = 5;

const STORAGE_KEY = "minddy:status-errors";

const byRecency = (a: StatusError, b: StatusError) => b.at - a.at;

function readRaw(): StatusError[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StatusError[]) : [];
  } catch {
    // Corrupt JSON or localStorage unavailable (private mode) — start empty.
    return [];
  }
}

function persist(errors: StatusError[]): StatusError[] {
  const trimmed = [...errors].sort(byRecency).slice(0, MAX_STATUS_ERRORS);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* quota / disabled — the error simply isn't kept. */
    }
  }
  return trimmed;
}

/** Every recorded error, most recent first. */
export function readErrorHistory(): StatusError[] {
  return readRaw().sort(byRecency);
}

/**
 * Record an error and return the trimmed list. Upsert by message: retrying a
 * failing action re-ranks the same error instead of stacking duplicates.
 */
export function recordError(error: StatusError): StatusError[] {
  return persist([error, ...readRaw().filter((e) => e.message !== error.message)]);
}

/** Drop every recorded error. */
export function clearErrorHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* unavailable — nothing to clear anyway. */
  }
}

/**
 * "3 minutes ago"-style age of a recorded error, in the reader's locale — the
 * history is old news by construction, so a relative label reads better than a
 * clock time.
 */
export function formatStatusAge(at: number, locale: string, now: number = Date.now()): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 1) return format.format(0, "second");
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  return format.format(-Math.round(hours / 24), "day");
}
