// Account preferences for Cycles (MIN-32) — the user's personal cross-project
// week/fortnight. Stored in the account's Supabase auth `user_metadata`, same
// mechanism as `auto_assign_on_start` / `numo_default_status`: one key per
// knob, resolved with a default so an untouched account gets Linear-like
// defaults (1 week, starts Monday, medium intensity, 2 upcoming, auto-capture
// on). Server-safe: no React import, so route handlers, the server cores and
// the assistant loop share the same resolver.

export type CycleIntensity = "light" | "medium" | "heavy";

export const CYCLE_INTENSITIES = ["light", "medium", "heavy"] as const;

export const CYCLES_ENABLED_META_KEY = "cycles_enabled";
export const CYCLE_DURATION_WEEKS_META_KEY = "cycle_duration_weeks";
export const CYCLE_START_DOW_META_KEY = "cycle_start_dow";
export const CYCLE_INTENSITY_META_KEY = "cycle_intensity";
export const CYCLE_UPCOMING_COUNT_META_KEY = "cycle_upcoming_count";
export const CYCLE_AUTO_CAPTURE_STARTED_META_KEY = "cycle_auto_capture_started";
export const CYCLE_AUTO_CAPTURE_COMPLETED_META_KEY = "cycle_auto_capture_completed";

export interface CyclePrefs {
  /** Cycles are opt-in: nothing exists until the user activates them. */
  enabled: boolean;
  /** Week or fortnight — the only two durations offered in v1. */
  durationWeeks: 1 | 2;
  /** ISO day of week the cycle starts on (1 = Monday … 7 = Sunday). */
  startDow: number;
  /** Personal pace preference — maps to a target-points capacity. */
  intensity: CycleIntensity;
  /** How many upcoming cycles to keep created ahead of the current one. */
  upcomingCount: number;
  /** Capture an uncycled assigned issue into the current cycle when it starts. */
  autoCaptureStarted: boolean;
  /** Same capture when the issue completes (so finished work counts). */
  autoCaptureCompleted: boolean;
}

export function isCycleIntensity(value: unknown): value is CycleIntensity {
  return (CYCLE_INTENSITIES as readonly unknown[]).includes(value);
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" ? Math.trunc(value) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Read the cycle preferences from a user's auth user_metadata, applying the
 *  v1 defaults for anything unset or invalid. */
export function resolveCyclePrefs(
  meta: Record<string, unknown> | null | undefined
): CyclePrefs {
  const intensity = meta?.[CYCLE_INTENSITY_META_KEY];
  return {
    enabled: meta?.[CYCLES_ENABLED_META_KEY] === true,
    durationWeeks: meta?.[CYCLE_DURATION_WEEKS_META_KEY] === 2 ? 2 : 1,
    startDow: clampInt(meta?.[CYCLE_START_DOW_META_KEY], 1, 7, 1),
    intensity: isCycleIntensity(intensity) ? intensity : "medium",
    upcomingCount: clampInt(meta?.[CYCLE_UPCOMING_COUNT_META_KEY], 1, 4, 2),
    autoCaptureStarted: meta?.[CYCLE_AUTO_CAPTURE_STARTED_META_KEY] !== false,
    autoCaptureCompleted: meta?.[CYCLE_AUTO_CAPTURE_COMPLETED_META_KEY] !== false,
  };
}
