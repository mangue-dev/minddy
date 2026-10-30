import { expandProjectSegment } from "./ref-registry";
import { notifyManager, type QueryClient, type QueryObserverOptions } from "@tanstack/react-query";
import { isDefinitiveReadError } from "./backend-availability";
import type { RetainedAppView } from "./retained-app-views";

export function retainedBoardKeys(view: RetainedAppView): readonly (readonly unknown[])[] {
  if (view.kind === "global-board") return [["me", "board"], ["views", "global"], ["projects"]];
  return ["issues", "members", "categories", "objectives", "integrations", "issue-relations", "views"].map((prefix) => [prefix, expandProjectSegment(view.route.projectSegment)]);
}

/** Query observers can emit cache events during render; defer React notifications. */
export function subscribeRetainedBoardReadState(client: QueryClient, view: RetainedAppView, notify: () => void) {
  const keys = retainedBoardKeys(view);
  let stopped = false;
  const scheduledNotify = notifyManager.batchCalls(() => {
    if (!stopped) notify();
  });
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (keys.some((key) => key.length === event.query.queryKey.length && key.every((part, index) => part === event.query.queryKey[index]))) scheduledNotify();
  });
  return () => {
    stopped = true;
    unsubscribe();
  };
}

function expiredBoardQuery(client: QueryClient, key: readonly unknown[]) {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  // Query instances retain observer options, although QueryOptions omits staleTime.
  const option = (query?.options as QueryObserverOptions | undefined)?.staleTime;
  const staleTime = typeof option === "function" && query ? option(query) : option;
  return typeof staleTime === "number" && staleTime > 0 && query?.isStaleByTime(staleTime);
}

/** React Activity resumes effects without remounting query observers. */
export function refreshRetainedBoard(client: QueryClient, view: RetainedAppView) {
  return Promise.all(retainedBoardKeys(view).map((queryKey) => {
    const query = client.getQueryCache().find({ queryKey, exact: true });
    if (!query || (query.state.status !== "error" && !query.isStale() && !expiredBoardQuery(client, queryKey))) return;
    return client.refetchQueries({ queryKey, exact: true }, { cancelRefetch: false });
  }));
}

type BoardQueryState = ReturnType<QueryClient["getQueryState"]>;
const blocksBoard = (state: BoardQueryState) =>
  state?.status === "error" && (state.data === undefined || isDefinitiveReadError(state.error));

/** Distinguish incomplete reads from background updates to a loaded board. */
export function retainedBoardReadState(client: QueryClient, view: RetainedAppView): "loading" | "fresh" | "refreshing" | "paused" | "error" {
  const states = retainedBoardKeys(view).map((key) => client.getQueryState(key));
  if (states.some((state) => state?.fetchStatus === "paused")) return "paused";
  // A failed background refresh keeps the loaded board on screen as stale
  // content (MIN-691); only a missing prerequisite or withdrawn access blocks it.
  if (states.some(blocksBoard)) return "error";
  if (states.some((state) => state?.data === undefined)) return "loading";
  if (states.some((state) => state?.status === "error" || state?.isInvalidated || state?.fetchStatus === "fetching")) return "refreshing";
  return "fresh";
}

/** The error of the prerequisite that blocks the board, for its explanation. */
export function retainedBoardReadFailure(client: QueryClient, view: RetainedAppView): unknown {
  return retainedBoardKeys(view).map((key) => client.getQueryState(key)).find(blocksBoard)?.error;
}
