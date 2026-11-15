type DurationParts = { hours?: number; minutes?: number; seconds?: number };

const UNIT_OF: Record<keyof DurationParts, "hour" | "minute" | "second"> = {
  hours: "hour",
  minutes: "minute",
  seconds: "second",
};

/**
 * Narrow localized duration ("1h 2m", "1h 2min", "1 h 2 min") built from
 * `Intl.NumberFormat` unit pieces, zero parts left out. `Intl.DurationFormat`
 * is not used: it is missing below Chrome 129 and Firefox 136, and its German
 * output differs from these pieces, so a server render would not match the
 * hydrating browser.
 */
function formatDurationParts(parts: DurationParts, locale: string): string {
  return (Object.keys(UNIT_OF) as (keyof DurationParts)[])
    .filter((key) => (parts[key] ?? 0) > 0)
    .map((key) =>
      new Intl.NumberFormat(locale, {
        style: "unit",
        unit: UNIT_OF[key],
        unitDisplay: "narrow",
      }).format(parts[key] ?? 0),
    )
    .join(" ");
}

/** Compact wall-clock duration between the persisted start and completion. */
export function formatRoutineRunDuration(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
  locale = "en",
): string {
  if (!startedAt || !completedAt) return "—";
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    return "—";
  }
  const seconds = Math.max(1, Math.round((completed - started) / 1000));
  if (seconds < 60) return formatDurationParts({ seconds }, locale);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return formatDurationParts({ minutes, seconds: seconds % 60 }, locale);
  return formatDurationParts({ hours: Math.floor(minutes / 60), minutes: minutes % 60 }, locale);
}

/**
 * Share of included monthly usage consumed by one run. It is private to the
 * owner; BYOK never consumes included Minddy usage, and plans without a budget
 * have no meaningful share.
 */
export function routineRunUsagePercent(
  input: {
    costUsd: number;
    includedUsageUsd: number;
    keyMode: "platform" | "byok";
    isOwner: boolean;
  },
): number | null {
  if (!input.isOwner || input.keyMode === "byok" || input.includedUsageUsd <= 0) {
    return null;
  }
  return (Math.max(0, Number.isFinite(input.costUsd) ? input.costUsd : 0) /
    input.includedUsageUsd) * 100;
}
