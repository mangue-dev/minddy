import { buildViewHref } from "@/lib/saved-view-href";
import type { View } from "@/lib/types";

type BoardViewIdentity = Pick<View, "id" | "kind">;

/** Canonical URL that restores one kanban tab in a fresh application tab. */
export function boardViewTabHref(
  pathname: string,
  search: string | URLSearchParams,
  view: BoardViewIdentity | "cycle",
): string {
  const value = view === "cycle" ? "cycle" : view.kind === "my" ? "my" : view.id;
  return buildViewHref(pathname, search.toString(), {
    view: value,
    // A saved view replaces temporary board scopes rather than nesting in them.
    family: null,
    objective: null,
  });
}
