/**
 * A counter of a sidebar or tab entry (inbox, PR, triage, project). Capped at
 * "99+": a queue that is very late must not widen the line to the point of
 * cropping the label. `label` is used as a reading for the screen reader, for
 * whom a "12" next to a project name means nothing.
 */
/** "99+" past two digits, shared by every counter (sidebar, tabs, Inbox pill). */
export function countLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function countBadge(count: number, label?: string) {
  return (
    <span
      className="text-xs tabular-nums text-muted-foreground"
      aria-label={label}
    >
      {countLabel(count)}
    </span>
  );
}

/**
 * The badge of an entry that carries a COUNTER. Zero does nothing: the row
 * stays bare.
 */
export function countBadges(
  count: number,
  label?: string,
): { badge: React.ReactNode } {
  if (count <= 0) return { badge: undefined };
  return { badge: countBadge(count, label) };
}
