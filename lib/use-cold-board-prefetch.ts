"use client";

import { useEffect } from "react";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { globalBoardQueryFn } from "./global-board-api";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";
import { fetchViewsApi } from "./views-api";

/** Start authenticated cold board reads before the lazy view can mount. */
export function useColdBoardPrefetch(active: boolean) {
  const client = useQueryClient();
  const restoring = useIsRestoring();

  useEffect(() => {
    if (!active || restoring) return;
    // The same query owns cancellation, deduplication and pending-write overlays.
    // Existing data, including stale restored data, keeps the board's normal
    // reconciliation path. No observer stays active when the view is hidden.
    if (client.getQueryData(GLOBAL_BOARD_KEY) === undefined) {
      void client.prefetchQuery({ queryKey: GLOBAL_BOARD_KEY, queryFn: globalBoardQueryFn });
    }
    // Saved views are also a render prerequisite: preserve the selected filters
    // while starting the existing small query beside the board data request.
    if (client.getQueryData(["views", "global"]) === undefined) {
      void client.prefetchQuery({
        queryKey: ["views", "global"],
        queryFn: ({ signal }) => fetchViewsApi({ kind: "global" }, signal),
      });
    }
  }, [active, restoring, client]);
}
