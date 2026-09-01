const EXPLICIT_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parses a forge timestamp as an instant. Zone-less ISO values are interpreted
 * as UTC, malformed values stay unavailable, and clock skew is clamped to `now`
 * so a newly created forge object never appears to come from the future.
 */
export function normalizeForgeInstant(
  value: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const normalized = EXPLICIT_ZONE.test(trimmed) ? trimmed : `${trimmed}Z`;
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(Math.min(milliseconds, now.getTime()));
}
