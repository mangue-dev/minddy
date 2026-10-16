import type { QueryClient } from "@tanstack/react-query";
import { appTabRoute } from "./app-tab-location";

/** Select one nearby project from the account's authorized project list, never a stored URL alone. */
export function adjacentProjectDestination(client: QueryClient, active: string, visits: readonly string[], available: readonly string[]): string | undefined {
  const state = client.getQueryState<{ id: string }[]>(["projects"]);
  if (state?.status !== "success" || state.isInvalidated || !Array.isArray(state.data)) return;
  const ids = [...new Set(state.data.map((project) => project.id))];
  const current = [...visits].reverse().concat(active, ...available).map(appTabRoute)
    .find((route) => route.projectId && ids.includes(route.projectId));
  if (!current?.projectId) return;
  const index = ids.indexOf(current.projectId);
  const next = ids[index + 1] ?? ids[index - 1];
  if (next) return `/projects/${next}`;
}
