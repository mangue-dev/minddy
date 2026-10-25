export function latestCompatibilityEntry<Entry extends { minddyRelease: string }>(
  entries: readonly Entry[],
): Entry;
