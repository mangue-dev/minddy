import type {
  AssistantPageContext,
  AssistantSelectedItemKind,
} from "@/lib/assistant-types";

/**
 * The Numo context of records selected on a list surface (MIN-873).
 *
 * A single record uses the surface's SINGULAR fields, like
 * `issuesPageContext`: the pill then names it, and the server prompt takes
 * its "this feedback / this routine" branch. Several go into
 * `selectedItems`, which the prompt lists with each id.
 */
export function selectedItemsPageContext(
  kind: AssistantSelectedItemKind,
  items: ReadonlyArray<{ id: string; title: string }>,
): AssistantPageContext {
  if (items.length === 1) {
    const [{ id, title }] = items;
    switch (kind) {
      case "feedback":
        return { feedbackId: id, feedbackTitle: title };
      case "routine":
        return { routineId: id, routineTitle: title };
      case "objective":
        return { objectiveId: id, objectiveName: title };
      case "page":
        return { pageId: id, pageTitle: title };
    }
  }
  return {
    selectedItems: items.map(({ id, title }) => ({ kind, id, label: title })),
  };
}
