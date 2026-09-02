/** Compact wall-clock duration between the persisted start and completion. */
export function formatRoutineRunDuration(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
): string {
  if (!startedAt || !completedAt) return "—";
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    return "—";
  }
  const seconds = Math.max(1, Math.round((completed - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
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
