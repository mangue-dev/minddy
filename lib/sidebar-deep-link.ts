/**
 * Decide whether a deep-linked sidebar item requires widening the active
 * filter. Missing targets are still loading, so they must not change the
 * filter until their actual state is known.
 */
export function deepLinkNeedsAllFilter<T>(
  items: readonly T[],
  isTarget: (item: T) => boolean,
  isVisible: (item: T) => boolean,
): boolean {
  const target = items.find(isTarget);
  return target !== undefined && !isVisible(target);
}
