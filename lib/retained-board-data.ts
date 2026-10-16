import { QueryObserver, type Query, type QueryClient } from "@tanstack/react-query";
import type { RetainedAppView } from "./retained-app-views";

const PROJECT_PREFIXES = ["issues", "members", "categories", "objectives", "integrations", "issue-relations", "views"];

function retainedScope(views: readonly RetainedAppView[]) {
  const ids = (kinds: readonly RetainedAppView["kind"][]) =>
    [...new Set(views.filter((view) => kinds.includes(view.kind)).map((view) => view.route.projectId))].sort();
  const projects = ids(["project-board", "triage"]);
  const pageProjects = ids(["pages"]);
  const feedbackProjects = ids(["feedback"]);
  const global = views.some((view) => view.kind === "global-board");
  return {
    signature: JSON.stringify([global, projects, pageProjects, feedbackProjects]),
    matches: (key: readonly unknown[]) => {
      if (key.length !== 2) return false;
      if (global && ((key[0] === "me" && key[1] === "board") || (key[0] === "views" && key[1] === "global"))) return true;
      if ((key[0] === "pages" && pageProjects.includes(key[1] as string)) ||
        (key[0] === "feedback" && feedbackProjects.includes(key[1] as string))) return true;
      return projects.includes(key[1] as string) && PROJECT_PREFIXES.includes(key[0] as string);
    },
  };
}

/** Keep already-loaded hidden prerequisites current through the shared bridge.
 * No speculative fetch, timer, second store or independent realtime channel.
 * One long-lived owner follows the retained views: a query that stays in
 * scope keeps its observer, so a switch never leaves an in-flight read
 * without observers (query-core would cancel it and the board restart it). */
export function createRetainedBoardData(client: QueryClient) {
  const cache = client.getQueryCache();
  const observed = new Map<string, { query: Query; stop: () => void }>();
  let scope = retainedScope([]);
  let stopped = false;
  const attach = (query: Query) => {
    if (stopped || observed.has(query.queryHash) || !scope.matches(query.queryKey) || query.state.data === undefined || !query.options.queryFn) return;
    // Retain the actual owner's options, including reconciliation and signals.
    // Set the sentinel before subscribe emits its own cache notification.
    const entry = { query, stop: () => {} };
    observed.set(query.queryHash, entry);
    const observer = new QueryObserver(client, { ...query.options, queryKey: query.queryKey, enabled: true, refetchOnMount: false, refetchInterval: false });
    entry.stop = observer.subscribe(() => {});
  };
  const unsubscribe = cache.subscribe((event) => {
    if (event.type === "removed") {
      observed.get(event.query.queryHash)?.stop();
      observed.delete(event.query.queryHash);
    } else if (event.type === "added" || event.type === "updated") attach(event.query);
  });
  return {
    update(views: readonly RetainedAppView[]) {
      const next = retainedScope(views);
      // A switch reorders the same views: nothing to attach or release.
      if (stopped || next.signature === scope.signature) return;
      scope = next;
      // Attach new matches before releasing old ones; shared queries keep theirs.
      for (const query of cache.getAll()) attach(query);
      for (const [hash, entry] of observed) {
        if (scope.matches(entry.query.queryKey)) continue;
        entry.stop();
        observed.delete(hash);
      }
    },
    dispose() {
      stopped = true;
      unsubscribe();
      for (const { stop } of observed.values()) stop();
      observed.clear();
    },
  };
}

export function observeRetainedBoardData(client: QueryClient, views: readonly RetainedAppView[]): () => void {
  const data = createRetainedBoardData(client);
  data.update(views);
  return data.dispose;
}
