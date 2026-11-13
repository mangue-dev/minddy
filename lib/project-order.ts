/**
 * The order of my projects in the sidebar and the project switchers (MIN-968).
 *
 * A personal preference: the account's `user_metadata` keeps the ordered
 * project ids under `project_order`, and nobody else's sidebar changes. The
 * list may name projects I left or that went to the trash, and may miss the
 * ones I joined since; ordering tolerates both.
 */
export const PROJECT_ORDER_META_KEY = "project_order";

/** Enough for any real account, small enough for the session token. */
export const PROJECT_ORDER_MAX = 200;

/** The saved order, tolerating a missing or corrupt value. */
export function resolveProjectOrder(meta: Record<string, unknown> | null | undefined): string[] {
  const raw = meta?.[PROJECT_ORDER_META_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string").slice(0, PROJECT_ORDER_MAX);
}

/**
 * The projects in my order: the ones the saved order names first, in that
 * order, then the others in the order they came in (a project I joined after
 * my last reorder lands at the end).
 */
export function applyProjectOrder<P extends { id: string }>(projects: readonly P[], order: readonly string[]): P[] {
  if (order.length === 0) return [...projects];
  const rank = new Map<string, number>();
  order.forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index);
  });
  return projects
    .map((project, index) => ({ project, index, rank: rank.get(project.id) }))
    .sort((a, b) => {
      if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
      if (a.rank !== undefined) return -1;
      if (b.rank !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ project }) => project);
}

/**
 * The order to save after moving `activeId` to the place of `overId`, over
 * every project I can see (hidden ones included, so hiding one later does
 * not shuffle the others). Ids that no longer match a project are dropped.
 * Returns null when nothing moves.
 */
export function moveProjectInOrder(
  projects: readonly { id: string }[],
  order: readonly string[],
  activeId: string,
  overId: string,
): string[] | null {
  if (activeId === overId) return null;
  const ids = applyProjectOrder(projects, order).map((project) => project.id);
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0) return null;
  ids.splice(to, 0, ...ids.splice(from, 1));
  return ids.slice(0, PROJECT_ORDER_MAX);
}
