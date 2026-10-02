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

/**
 * The full decision the widening effect needs, including the case
 * `deepLinkNeedsAllFilter` folds into `false`:
 *
 * - `"pending"` — the target has not arrived yet: neither settle nor widen,
 * the next list change will decide.
 * - `"widen"` — the target is here but outside the active lens: widen ONCE,
 * at resolution.
 * - `"settled"` — the target is resolved and visible: the link's job is done
 * and the active filter becomes the master rule.
 *
 * The distinction matters because the widening must not re-run after the
 * settlement: a refetch that re-pins a row the lens now excludes (a merge
 * under the default "open" lens, most often) used to re-widen the filter on
 * every list change, making the lens impossible to restore.
 */
export type DeepLinkLensDecision = "pending" | "widen" | "settled";

export function deepLinkLensDecision<T>(
  items: readonly T[],
  isTarget: (item: T) => boolean,
  isVisible: (item: T) => boolean,
): DeepLinkLensDecision {
  const target = items.find(isTarget);
  if (!target) return "pending";
  return isVisible(target) ? "settled" : "widen";
}

/** Forge states after which a PR can no longer belong to the default "open"
    lens — a deep link that asked for it while it was live is fulfilled. */
export function isTerminalPrState(state: string): boolean {
  return state === "merged" || state === "closed";
}

/**
 * The address a consumed deep link leaves behind: same path, the `pr`/`run`
 * params stripped, every other param preserved. The page keeps its selection
 * in memory and publishes the address that reconstructs it, so the URL only
 * needs to carry the link until it has been honored — past that, a stale
 * `?pr=` re-pins its row into every refetch and re-widens the lens on the
 * next load, against the filter the reader chose.
 */
export function consumedDeepLinkHref(pathname: string, search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete("pr");
  params.delete("run");
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
