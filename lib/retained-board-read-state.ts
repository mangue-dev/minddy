import type { QueryClient } from "@tanstack/react-query";
import type { RetainedAppView } from "./retained-app-views";

export function retainedBoardKeys(view: RetainedAppView): readonly (readonly unknown[])[] {
  if (view.kind === "global-board") return [["me", "board"], ["views", "global"], ["projects"]];
  return ["issues", "members", "categories", "objectives", "integrations", "issue-relations", "views"].map((prefix) => [prefix, view.route.projectId]);
}

/** Cached rows stay usable, but known uncertainty is never reported as fresh. */
export function retainedBoardReadState(client: QueryClient, view: RetainedAppView): "fresh" | "refreshing" | "paused" | "error" {
  const states = retainedBoardKeys(view).map((key) => client.getQueryState(key)).filter((state) => state?.data !== undefined);
  if (states.some((state) => state?.fetchStatus === "paused")) return "paused";
  if (states.some((state) => state?.status === "error")) return "error";
  if (states.some((state) => state?.isInvalidated || state?.fetchStatus === "fetching")) return "refreshing";
  return "fresh";
}
