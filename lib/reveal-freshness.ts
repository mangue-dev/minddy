import { realtimeCoverageLive } from "./realtime-coverage";

/** How long a realtime-covered read stays trusted when its view mounts or is revealed again. */
export const REVEAL_FRESHNESS_MS = 30_000;

interface RevealedQuery {
  state: { dataUpdatedAt: number; isInvalidated: boolean; status: string };
}

/**
 * `refetchOnMount` for reads that realtime invalidates.
 *
 * A retained view reconnects its observers on every reveal. Reading again each
 * time duplicated a cache that realtime had kept current. The read still runs
 * when an event or a catch-up invalidated the entry, when the last read failed,
 * when it is older than the window, or while a realtime scope is not joined.
 * Refetch intervals and realtime invalidation are unchanged.
 */
export function refetchOnRevealWhenStale(query: RevealedQuery): "always" | false {
  const { dataUpdatedAt, isInvalidated, status } = query.state;
  if (isInvalidated || status === "error" || !realtimeCoverageLive()) return "always";
  return Date.now() - dataUpdatedAt >= REVEAL_FRESHNESS_MS ? "always" : false;
}
