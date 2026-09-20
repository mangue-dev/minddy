import type { QueryClient } from "@tanstack/react-query";

import { appTabRoute } from "./app-tab-location";
import { prefetchPageNavigation } from "./use-pages-query";
import { prefetchProjectQueries } from "./use-prefetch-project";
import { routinesQueryKey } from "./use-routines-query";
import { fetchRoutinesApi } from "./routines-api";
import { agentModelsQueryKey, fetchAgentModels } from "./use-agent-models-query";
import {
  PULL_REQUESTS_PAGE,
  allPullRequestsQueryKey,
} from "./use-agent-runs";
import { fetchAllPullRequestsApi } from "./agent-api";
import { globalBoardQueryFn } from "./global-board-api";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";
import { fetchViewsApi } from "./views-api";
import { fetchStatsApi } from "./stats-api";
import { statsTimeZone } from "./use-stats-query";

/**
 * Preheats the client caches a tab destination needs (fourth pass, MIN-540).
 *
 * A first open of a tab follows: navigation, route chunk, mount, THEN the
 * page's queries. Prefetching on the browsing intent (hovering the
 * destination in the palette or an existing tab label) covers the query
 * wave with the time the user takes to click — the panel then paints from
 * cache instead of skeletons.
 *
 * `attempted` guards one attempt per href so that repeated hovers on the
 * same row do not repeat the work; `prefetchQuery` itself respects
 * `staleTime`, so a fresh cache triggers no request.
 *
 * The page-navigation prefetch keeps its special handling: a wiki page
 * carries its own document prefetch. Everything else maps the tab route to
 * the queries the destination renders first.
 */
export function prefetchAppTabDestination(
  queryClient: QueryClient,
  href: string,
  attempted: Set<string>,
): void {
  if (attempted.has(href)) return;
  attempted.add(href);

  const route = appTabRoute(href);
  if (route.projectId && route.pageId) {
    prefetchPageNavigation(queryClient, route.projectId, route.pageId);
    return;
  }
  if (route.projectId) {
    prefetchProjectQueries(queryClient, route.projectId);
    return;
  }

  switch (route.section) {
    case "routines": {
      void queryClient.prefetchQuery({ queryKey: routinesQueryKey(), queryFn: fetchRoutinesApi });
      void queryClient.prefetchQuery({
        queryKey: agentModelsQueryKey,
        queryFn: () => fetchAgentModels("user", "text"),
      });
      return;
    }
    case "pull-requests": {
      if (route.prId) return;
      void queryClient.prefetchQuery({
        queryKey: allPullRequestsQueryKey("open", PULL_REQUESTS_PAGE),
        queryFn: () => fetchAllPullRequestsApi({ state: "open", limit: PULL_REQUESTS_PAGE }),
      });
      return;
    }
    case "all": {
      // The same prerequisite reads the cold board mount starts; an existing
      // entry (including restored stale data) keeps its reconciliation path.
      if (queryClient.getQueryData(GLOBAL_BOARD_KEY) === undefined) {
        void queryClient.prefetchQuery({ queryKey: GLOBAL_BOARD_KEY, queryFn: globalBoardQueryFn });
      }
      if (queryClient.getQueryData(["views", "global"]) === undefined) {
        void queryClient.prefetchQuery({
          queryKey: ["views", "global"],
          queryFn: ({ signal }) => fetchViewsApi({ kind: "global" }, signal),
        });
      }
      return;
    }
    case "statistics": {
      const tz = statsTimeZone();
      void queryClient.prefetchQuery({ queryKey: ["stats", tz], queryFn: () => fetchStatsApi(tz) });
      return;
    }
    default:
  }
}
