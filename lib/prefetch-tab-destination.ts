import { prepareAppTabSurface, isAppTabSurfaceReady } from "./app-tab-surfaces";
import { feedbackQueryOptions } from "./feedback-query";
import { fetchPagesApi, fetchPageApi } from "./pages-api";
import { pagesKey, pageKey } from "./use-pages-query";
import { issuesQueryFn } from "./issues-api";
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
import { pullRequestAccountRetryAt, pullRequestQueryOptions } from "./pull-request-query";
import { globalBoardQueryFn } from "./global-board-api";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";
import { fetchViewsApi } from "./views-api";
import { fetchStatsApi } from "./stats-api";
import { statsTimeZone } from "./use-stats-query";

const pullRequestWarmups = new WeakMap<QueryClient, Promise<void>>();

export function prefetchPullRequestDetail(queryClient: QueryClient, prId: string): Promise<void> | null {
  if (pullRequestWarmups.has(queryClient) || pullRequestAccountRetryAt(queryClient) > Date.now()) return null;
  const pending = queryClient.prefetchQuery({
    ...pullRequestQueryOptions(prId),
    // Intent preparation is only a display optimization. Activation validates
    // after the click through the foreground options, regardless of this age.
    staleTime: 5_000,
    retry: false,
  });
  pullRequestWarmups.set(queryClient, pending);
  void pending.finally(() => {
    if (pullRequestWarmups.get(queryClient) === pending) pullRequestWarmups.delete(queryClient);
  });
  return pending;
}

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
  void prepareAppTabSurface(href)?.catch(() => {});

  const route = appTabRoute(href);
  if (route.projectId && route.section === "pages") {
    void queryClient.prefetchQuery({ queryKey: pagesKey(route.projectId), queryFn: ({ signal }) => fetchPagesApi(route.projectId!, signal) });
    if (route.pageId) prefetchPageNavigation(queryClient, route.projectId, route.pageId);
    return;
  }
  if (route.projectId && route.section === "feedback") {
    void queryClient.prefetchQuery(feedbackQueryOptions(route.projectId));
    return;
  }
  if (route.projectId && route.section !== "tickets" && route.section !== "triage") return;
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
      if (pullRequestAccountRetryAt(queryClient) > Date.now()) { attempted.delete(href); return; }
      if (route.prId) {
        // One speculative detail per account client; the foreground can join
        // its normal query. No polling or additional plaintext cache.
        const pending = prefetchPullRequestDetail(queryClient, route.prId);
        if (!pending) { attempted.delete(href); return; }
        void pending.finally(() => {
          attempted.delete(href);
        });
      }
      void queryClient.prefetchQuery({
        queryKey: allPullRequestsQueryKey("open", PULL_REQUESTS_PAGE, route.prId ? { pr: route.prId } : undefined),
        queryFn: () => fetchAllPullRequestsApi({ state: "open", limit: PULL_REQUESTS_PAGE, pin: route.prId ? { pr: route.prId } : undefined }),
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

/** A single primary query per ranked destination; no second cache or timer. */
export function appTabPreparationQuery(client: QueryClient, href: string) {
  const route = appTabRoute(href);
  if (route.prId && route.section === "pull-requests") return pullRequestQueryOptions(route.prId);
  if (route.projectId && route.section === "pages") {
    if (route.pageId) return { queryKey: pageKey(route.pageId), queryFn: ({ signal }: { signal: AbortSignal }) => fetchPageApi(route.projectId!, route.pageId!, signal) };
    return { queryKey: pagesKey(route.projectId), queryFn: ({ signal }: { signal: AbortSignal }) => fetchPagesApi(route.projectId!, signal) };
  }
  if (route.projectId && route.section === "feedback") return feedbackQueryOptions(route.projectId);
  if (route.projectId && ["tickets", "triage"].includes(route.section)) return { queryKey: ["issues", route.projectId] as const, queryFn: issuesQueryFn(route.projectId) };
  if (route.section === "all") return { queryKey: GLOBAL_BOARD_KEY, queryFn: globalBoardQueryFn };
  return null;
}

/** Only public prepared code and existing query data permit a local mount.
 * The mounted consumer retains its ordinary authority/refetch contract. */
export function isPreparedAppTabDestination(client: QueryClient, href: string): boolean {
  if (!isAppTabSurfaceReady(href)) return false;
  const options = appTabPreparationQuery(client, href);
  const state = options && client.getQueryState(options.queryKey);
  return !!state && state.data !== undefined && state.status !== "error" && !state.isInvalidated;
}
