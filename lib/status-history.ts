// Error history for the bottom-bar status line (MIN-555). When an error toast
// fires, the status line shows it once and then lets it go — this store is the
// memory behind the bell button, so the user can still read what failed after
// the line is gone. The device keeps a capped encrypted snapshot for 24 hours;
// encryption and authenticated restoration use the server, with no snapshot DB.
//
// Server-safe by guard: every accessor short-circuits when `window` is absent,
// following the `lib/drafts.ts` pattern.

import { removeLocalSnapshot, restoreLocalSnapshot, saveLocalSnapshot } from "./local-snapshots";

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
let current: StatusError[] = [];
let revision = 0;

const byRecency = (a: StatusError, b: StatusError) => b.at - a.at;

function readRaw(): StatusError[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return current;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) removeLocalSnapshot(window.localStorage, STORAGE_KEY);
    return current;
  } catch {
    // Corrupt JSON or localStorage unavailable (private mode) — start empty.
    return current;
  }
}

function persist(errors: StatusError[]): StatusError[] {
  const trimmed = errors.filter((entry) => Number.isFinite(entry.at) && Date.now() - entry.at <= 24 * 60 * 60 * 1000).sort(byRecency).slice(0, MAX_STATUS_ERRORS);
  current = trimmed;
  revision++;
  if (typeof window !== "undefined") {
    try {
      void saveLocalSnapshot(window.localStorage, STORAGE_KEY, "status-history", trimmed).catch(() => {});
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

/** Rehydrate encrypted history without overwriting errors recorded during startup. */
export async function restoreErrorHistory(): Promise<StatusError[]> {
  if (typeof window === "undefined") return [];
  const started = revision;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return current;
  const parsed = JSON.parse(raw);
  if (parsed?.format !== "minddy-local-v1") {
    removeLocalSnapshot(window.localStorage, STORAGE_KEY);
    return current;
  }
  const errors = await restoreLocalSnapshot(window.localStorage, STORAGE_KEY, "status-history");
  if (Array.isArray(errors) && started === revision) return persist(errors.filter((entry) => Number.isFinite(entry.at) && Date.now() - entry.at <= 24 * 60 * 60 * 1000));
  return current;
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
  current = [];
  revision++;
  if (typeof window === "undefined") return;
  try {
    removeLocalSnapshot(window.localStorage, STORAGE_KEY);
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
