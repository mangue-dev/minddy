"use client";

import { useEffect } from "react";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { globalBoardQueryFn } from "./global-board-api";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";

/** Start an authenticated cold board read before its lazy view can mount. */
export function useColdBoardPrefetch(active: boolean) {
  const client = useQueryClient();
  const restoring = useIsRestoring();

  useEffect(() => {
    if (!active || restoring || client.getQueryData(GLOBAL_BOARD_KEY) !== undefined) return;
    // The same query owns cancellation, deduplication and pending-write overlays.
    // Existing data, including stale restored data, keeps the board's normal
    // reconciliation path. No observer stays active when the view is hidden.
    void client.prefetchQuery({ queryKey: GLOBAL_BOARD_KEY, queryFn: globalBoardQueryFn });
  }, [active, restoring, client]);
}
