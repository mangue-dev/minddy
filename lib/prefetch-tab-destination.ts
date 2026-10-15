import { prepareAppTabSurface, isAppTabSurfaceReady } from "./app-tab-surfaces";
import { feedbackFiltersForDestination, feedbackQueryOptions } from "./feedback-query";
import { fetchPagesApi } from "./pages-api";
import { pagesKey, pageKey, fetchPageNavigationData } from "./use-pages-query";
import { issuesQueryFn } from "./issues-api";
import type { FetchQueryOptions, QueryClient, QueryFunction, QueryKey } from "@tanstack/react-query";

import { appTabRoute } from "./app-tab-location";
import { prefetchPageNavigation } from "./use-pages-query";
import { prefetchProjectQueries, projectPreparationQueries } from "./use-prefetch-project";
import { routinesQueryKey, routineRunsQueryKey } from "./use-routines-query";
import { fetchRoutinesApi, fetchRoutineRunsApi } from "./routines-api";
import { agentModelsQueryKey, fetchAgentModels } from "./use-agent-models-query";
import {
  PULL_REQUESTS_PAGE,
  allPullRequestsQueryOptions,
} from "./use-agent-runs";
import { pullRequestAccountRetryAt, pullRequestQueryOptions } from "./pull-request-query";
import { globalBoardQueryFn } from "./global-board-api";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";
import { fetchViewsApi } from "./views-api";
import { fetchStatsApi } from "./stats-api";
import { statsTimeZone } from "./use-stats-query";
import { myInvitationsQueryOptions } from "./invitations-api";
import { retainedAppViewKind } from "./retained-app-views";
import { feedbackSelectionItems, matchesObjectiveState, secondarySelectionId, triageSelectionItems } from "./secondary-view-selection";
import { issueWrites } from "./optimistic/issue-writes";
import { feedbackCommentsOptions, feedbackDetailOptions, feedbackEventsOptions, objectiveCommentsOptions,
  objectiveEventsOptions, objectiveFeedbackCountOptions, objectiveResourcesOptions } from "./secondary-view-queries";
import { issueCommentsOptions, issueEventsOptions } from "./issue-timeline-queries";
import type { GlobalBoardResponse, Issue, Objective } from "./types";
import type { TeamFeedbackListItem } from "./server/feedback/team-queries";

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
    void queryClient.prefetchQuery(feedbackQueryOptions(route.projectId, feedbackFiltersForDestination(href)));
    return;
  }
  if (route.projectId && route.section === "objectives") {
    for (const options of appTabPreparationQueries(queryClient, href)) void queryClient.prefetchQuery(options);
    for (const options of predictedSelectionReads(queryClient, href)) void queryClient.prefetchQuery(options);
    return;
  }
  if (route.projectId && route.section !== "tickets" && route.section !== "triage") return;
  if (route.projectId) {
    prefetchProjectQueries(queryClient, route.projectId);
    for (const options of predictedSelectionReads(queryClient, href)) void queryClient.prefetchQuery(options);
    return;
  }

  switch (route.section) {
    case "home": {
      void queryClient.prefetchQuery(myInvitationsQueryOptions);
      return;
    }
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
      void queryClient.prefetchQuery(allPullRequestsQueryOptions("open", PULL_REQUESTS_PAGE, route.prId ? { pr: route.prId } : undefined));
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
  if (route.section === "home") return myInvitationsQueryOptions;
  if (route.section === "routines") return { queryKey: routinesQueryKey(), queryFn: fetchRoutinesApi };
  if (route.projectId && route.section === "objectives") return projectPreparationQueries(client, route.projectId).find((option) => option.queryKey[0] === "objectives")!;
  if (route.prId && route.section === "pull-requests") return pullRequestQueryOptions(route.prId);
  if (route.section === "pull-requests") return allPullRequestsQueryOptions();
  if (route.projectId && route.section === "pages") {
    if (route.pageId) return { queryKey: pageKey(route.pageId), queryFn: ({ signal }: { signal: AbortSignal }) => fetchPageNavigationData(client, route.projectId!, route.pageId!, signal) };
    return { queryKey: pagesKey(route.projectId), queryFn: ({ signal }: { signal: AbortSignal }) => fetchPagesApi(route.projectId!, signal) };
  }
  if (route.projectId && route.section === "feedback") return feedbackQueryOptions(route.projectId, feedbackFiltersForDestination(href));
  if (route.projectId && ["tickets", "triage"].includes(route.section)) return { queryKey: ["issues", route.projectId] as const, queryFn: issuesQueryFn(route.projectId) };
  if (route.section === "all") return { queryKey: GLOBAL_BOARD_KEY, queryFn: globalBoardQueryFn };
  return null;
}

/** Only ordinary successful scoped lists may discover one selected detail. */
function selectionRows<T extends { id: string; project_id: string }>(client: QueryClient, key: readonly unknown[], projectId: string): T[] {
  const state = client.getQueryState(key);
  const data = state?.data;
  return state?.status === "success" && !state.isInvalidated && Array.isArray(data)
    ? data.filter((row): row is T => !!row && row.project_id === projectId && typeof row.id === "string") : [];
}

/** Fetch the consumer's exact reader without mounting its polling observer. */
function preparationRead<T, Key extends QueryKey>(options: {
  queryKey: Key; queryFn?: QueryFunction<T, Key> | symbol; staleTime?: unknown;
}): FetchQueryOptions<unknown> {
  return { queryKey: options.queryKey, staleTime: typeof options.staleTime === "number" ? options.staleTime : undefined,
    queryFn: (context) => {
      if (typeof options.queryFn !== "function") throw new Error("Selected detail requires its ordinary query reader");
      return options.queryFn({ ...context, queryKey: options.queryKey });
    } };
}

export function appTabSelectionSource(href: string): readonly unknown[] | null {
  const route = appTabRoute(href);
  if (!route.projectId) return null;
  if (route.section === "triage") return ["issues", route.projectId];
  if (route.section === "objectives") return ["objectives", route.projectId];
  if (route.section === "feedback") return feedbackQueryOptions(route.projectId, feedbackFiltersForDestination(href)).queryKey;
  return null;
}

function selectedTriageIssue(client: QueryClient, href: string): string | null {
  const route = appTabRoute(href);
  if (!route.projectId || route.section !== "triage") return null;
  const rows = triageSelectionItems(selectionRows<Issue>(client, ["issues", route.projectId], route.projectId));
  return secondarySelectionId(rows, new URL(href, "https://minddy.invalid").searchParams.get("issue"));
}

const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/**
 * Intent only. While the exact scoped list has no data, the page cannot pick
 * its default detail before that list returns. The complete global board,
 * when current, predicts that selection with the page's own rules so the
 * detail reads start with the list. The page still selects from the exact
 * list: a wrong prediction warms a detail it never shows. Never a preparation
 * prerequisite or readiness input.
 */
function predictedSelectionReads(client: QueryClient, href: string): FetchQueryOptions<unknown>[] {
  const route = appTabRoute(href);
  const projectId = route.projectId;
  if (!projectId || (route.section !== "triage" && route.section !== "objectives")) return [];
  if (client.getQueryData([route.section === "triage" ? "issues" : "objectives", projectId]) !== undefined) return [];
  const board = client.getQueryState<GlobalBoardResponse>(GLOBAL_BOARD_KEY);
  if (board?.status !== "success" || board.isInvalidated || !board.data) return [];
  const params = new URL(href, "https://minddy.invalid").searchParams;
  if (route.section === "triage") {
    const issues = Array.isArray(board.data.issues) ? board.data.issues.filter((issue) => issue?.project_id === projectId) : [];
    const id = secondarySelectionId(triageSelectionItems(issues), params.get("issue"));
    return id && !issueWrites.hasUnsettledInsert(id) ? [preparationRead(issueCommentsOptions(client, id)), preparationRead(issueEventsOptions(id))] : [];
  }
  const objectives = board.data.objectives?.[projectId];
  // The project reader's order: creation time, then id.
  const rows = Array.isArray(objectives) ? objectives.filter((row) => row?.project_id === projectId)
    .sort((a, b) => compareIds(a.created_at, b.created_at) || compareIds(a.id, b.id)) : [];
  const id = secondarySelectionId(rows.filter((row) => matchesObjectiveState(row, "active")), params.get("open"), null, rows);
  return id ? [preparationRead(objectiveCommentsOptions(id)), preparationRead(objectiveEventsOptions(id)),
    preparationRead(objectiveResourcesOptions(id)), preparationRead(objectiveFeedbackCountOptions(projectId, id))] : [];
}

/** An optimistic creation remains selected, but its detail endpoints do not exist yet. */
export function appTabPendingIssueSelection(client: QueryClient, href: string): string | null {
  const id = selectedTriageIssue(client, href);
  return id && issueWrites.hasUnsettledInsert(id) ? id : null;
}

/** Complete current prerequisites; selected details appear after their ordinary list succeeds. */
export function appTabPreparationQueries(client: QueryClient, href: string): FetchQueryOptions<unknown>[] {
  const route = appTabRoute(href);
  const params = new URL(href, "https://minddy.invalid").searchParams;
  const tree = route.projectId ? { queryKey: pagesKey(route.projectId), queryFn: ({ signal }: { signal: AbortSignal }) => fetchPagesApi(route.projectId!, signal) } : null;
  if (route.projectId && ["tickets", "triage"].includes(route.section)) {
    const queries = projectPreparationQueries(client, route.projectId);
    if (route.section === "triage") {
      queries.push(tree!);
      const id = selectedTriageIssue(client, href);
      if (id && !issueWrites.hasUnsettledInsert(id)) queries.push(preparationRead(issueCommentsOptions(client, id)), preparationRead(issueEventsOptions(id)));
    }
    return queries;
  }
  if (route.projectId && route.section === "objectives") {
    const queries = [...projectPreparationQueries(client, route.projectId).filter((option) => ["objectives", "issues", "members", "issue-relations"].includes(String(option.queryKey[0]))), tree!];
    const rows = selectionRows<Objective>(client, ["objectives", route.projectId], route.projectId);
    const id = secondarySelectionId(rows.filter((row) => matchesObjectiveState(row, "active")), params.get("open"), null, rows);
    if (id) queries.push(preparationRead(objectiveCommentsOptions(id)), preparationRead(objectiveEventsOptions(id)),
      preparationRead(objectiveResourcesOptions(id)), preparationRead(objectiveFeedbackCountOptions(route.projectId, id)));
    return queries;
  }
  if (route.projectId && route.section === "feedback") {
    const filters = feedbackFiltersForDestination(href);
    const list = feedbackQueryOptions(route.projectId, filters);
    const queries: FetchQueryOptions<unknown>[] = [list,
      ...projectPreparationQueries(client, route.projectId).filter((option) => ["issues", "issue-relations", "members", "categories", "objectives"].includes(String(option.queryKey[0]))), tree!];
    const state = client.getQueryState<{ posts: TeamFeedbackListItem[] }>(list.queryKey);
    const posts = state?.status === "success" && !state.isInvalidated && Array.isArray(state.data?.posts)
      ? state.data.posts.filter((post) => post.project_id === route.projectId) : [];
    const visible = feedbackSelectionItems(posts, { state: params.has("objective") ? "all" : "unresolved", properties: filters });
    const id = secondarySelectionId(visible, params.get("post"), null, posts);
    if (id) queries.push(preparationRead(feedbackDetailOptions(route.projectId, id)), preparationRead(feedbackCommentsOptions(route.projectId, id)), preparationRead(feedbackEventsOptions(route.projectId, id)));
    return queries;
  }
  if (route.section === "routines") {
    return [{ queryKey: routinesQueryKey(), queryFn: fetchRoutinesApi },
      { queryKey: agentModelsQueryKey, queryFn: () => fetchAgentModels("user", "text") },
      ...(route.routineId ? [{ queryKey: routineRunsQueryKey(route.routineId), queryFn: () => fetchRoutineRunsApi(route.routineId!) }] : [])];
  }
  const primary = appTabPreparationQuery(client, href);
  if (!primary) return [];
  const options: FetchQueryOptions<unknown>[] = [{ queryKey: primary.queryKey, queryFn: primary.queryFn }];
  if (route.prId && route.section === "pull-requests") options.push(allPullRequestsQueryOptions("open", PULL_REQUESTS_PAGE, { pr: route.prId }));
  if (route.projectId && route.section === "pages" && route.pageId) {
    options.push({ queryKey: pagesKey(route.projectId), queryFn: ({ signal }) => fetchPagesApi(route.projectId!, signal) },
      ...projectPreparationQueries(client, route.projectId).filter((option) => ["issues", "members", "objectives"].includes(String(option.queryKey[0]))));
  }
  if (route.section === "all") {
    options.push({ queryKey: ["views", "global"], queryFn: ({ signal }) => fetchViewsApi({ kind: "global" }, signal) });
  }
  return options;
}

/** Only public prepared code and existing query data permit a local mount.
 * The mounted consumer retains its ordinary authority/refetch contract. */
export function isPreparedAppTabDestination(client: QueryClient, href: string): boolean {
  if (!isAppTabSurfaceReady(href)) return false;
  if (appTabPendingIssueSelection(client, href)) return false;
  if (appTabRoute(href).section === "home") return true;
  // Only surfaces owned by the bounded host may bypass a server route commit.
  if (!retainedAppViewKind(href.split(/[?#]/)[0])) return false;
  const options = appTabPreparationQueries(client, href);
  return options.length > 0 && options.every((option) => {
    const state = client.getQueryState(option.queryKey);
    return !!state && state.data !== undefined && state.status !== "error" && !state.isInvalidated;
  });
}
