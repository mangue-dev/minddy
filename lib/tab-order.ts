/**
 * Per-user, per-scope ordering of a kanban board's tab strip (MIN-34).
 *
 * A "tab" is a view pill or the special Cycle pill. Because the Cycle tab is a
 * board MODE, not a `views` row, the strip order can't ride the views' DB
 * `position` column — so the whole order (views + Cycle) is persisted per user,
 * per scope in Supabase Auth `user_metadata` under `tab_orders[scope]` (where
 * minddy keeps its per-user state; see `lib/server/tab-orders.ts`). The stored
 * value is a plain array of tab keys: a view id, or the `CYCLE_TAB_KEY` sentinel.
 *
 * `useBoardViews.orderedViews` still provides the DEFAULT order; the stored list
 * is only a permutation overlaid on top (see `mergeTabOrder`). This module holds
 * the pure reconciliation logic, shared by the client and the API.
 */

/** Sentinel tab key for the (non-view) Cycle pill. */
export const CYCLE_TAB_KEY = "cycle";

/**
 * Reconcile a stored permutation with the tabs that currently exist:
 *  - keys the user last ordered keep their relative order (stale ones dropped);
 *  - a key not in the stored list (a freshly created view, or the Cycle pill
 *    first appearing) is inserted next to the neighbour it sits after in the
 *    default order — so a new view lands among the views, not after Cycle;
 *  - no stored order yet → the default order verbatim.
 */
export function mergeTabOrder(
  defaultKeys: string[],
  storedKeys: string[] | null
): string[] {
  if (!storedKeys || storedKeys.length === 0) return defaultKeys;

  const defaultSet = new Set(defaultKeys);
  const result = storedKeys.filter((k) => defaultSet.has(k));
  const placed = new Set(result);

  defaultKeys.forEach((key, i) => {
    if (placed.has(key)) return;
    // Insert after the nearest preceding default key already placed…
    let insertAt = -1;
    for (let j = i - 1; j >= 0; j--) {
      const idx = result.indexOf(defaultKeys[j]);
      if (idx !== -1) {
        insertAt = idx + 1;
        break;
      }
    }
    // …else before the nearest following placed key, else at the front.
    if (insertAt === -1) {
      insertAt = 0;
      for (let j = i + 1; j < defaultKeys.length; j++) {
        const idx = result.indexOf(defaultKeys[j]);
        if (idx !== -1) {
          insertAt = idx;
          break;
        }
      }
    }
    result.splice(insertAt, 0, key);
    placed.add(key);
  });

  return result;
}
