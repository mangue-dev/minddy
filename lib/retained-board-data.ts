import { QueryObserver, type QueryClient } from "@tanstack/react-query";
import type { RetainedAppView } from "./retained-app-views";

/** Keep already-loaded hidden prerequisites current through the shared bridge.
 * No speculative fetch, timer, second store or independent realtime channel. */
export function observeRetainedBoardData(client: QueryClient, views: readonly RetainedAppView[]): () => void {
  const projects = new Set(views.filter((view) => ["project-board", "triage"].includes(view.kind)).map((view) => view.route.projectId));
  const pageProjects = new Set(views.filter((view) => view.kind === "pages").map((view) => view.route.projectId));
  const feedbackProjects = new Set(views.filter((view) => view.kind === "feedback").map((view) => view.route.projectId));
  const global = views.some((view) => view.kind === "global-board");
  const stops = new Map<string, () => void>();
  const cache = client.getQueryCache();
  const matches = (key: readonly unknown[]) => {
    if (global && key.length === 2 && ((key[0] === "me" && key[1] === "board") || (key[0] === "views" && key[1] === "global"))) return true;
    if (key.length === 2 && ((key[0] === "pages" && pageProjects.has(key[1] as string)) ||
      (key[0] === "feedback" && feedbackProjects.has(key[1] as string)))) return true;
    return key.length === 2 && projects.has(key[1] as string) &&
      ["issues", "members", "categories", "objectives", "integrations", "issue-relations", "views"].includes(key[0] as string);
  };
  let stopped = false;
  const attach = () => {
    if (stopped) return;
    for (const query of cache.getAll()) {
      if (stops.has(query.queryHash) || !matches(query.queryKey) || query.state.data === undefined || !query.options.queryFn) continue;
      // Retain the actual owner's options, including reconciliation and signals.
      // Set the sentinel before subscribe emits its own cache notification.
      stops.set(query.queryHash, () => {});
      const observer = new QueryObserver(client, { ...query.options, queryKey: query.queryKey, enabled: true, refetchOnMount: false, refetchInterval: false });
      stops.set(query.queryHash, observer.subscribe(() => {}));
    }
  };
  const unsubscribe = cache.subscribe((event) => {
    if (event.type === "removed") {
      stops.get(event.query.queryHash)?.();
      stops.delete(event.query.queryHash);
    } else if (event.type === "added" || event.type === "updated") attach();
  });
  attach();
  return () => {
    stopped = true;
    unsubscribe();
    for (const stop of stops.values()) stop();
    stops.clear();
  };
}
