// The shape every typed-trigger menu shares ("/" blocks, "@" mentions, the
// routine "$" skills and the Numo composer's "@"): items grouped in sections
// under a muted header, and a "Close menu" row kept under the list.
//
// Pure, so the grouping and the keyboard contract are tested without a DOM.

/** A run of items under one header. `id` null: items with no section. */
export interface SuggestionSection<T> {
  id: string | null;
  /** Index, in the flat ordered list, of the section's first item. */
  start: number;
  items: T[];
}

/**
 * Groups items by section in the order each section first appears, keeping
 * the items' own order inside a section. A surface that puts an entry first
 * (the notebook's tasks) therefore puts its whole section first, and a
 * section never splits in two.
 *
 * `ordered` is the flat list the keyboard walks: the sections one after the
 * other, so the arrows flow from one section into the next.
 */
export function groupBySection<T>(
  items: readonly T[],
  sectionOf: (item: T) => string | null | undefined,
): { ordered: T[]; sections: SuggestionSection<T>[] } {
  const byId = new Map<string | null, T[]>();
  for (const item of items) {
    const id = sectionOf(item) ?? null;
    const list = byId.get(id);
    if (list) list.push(item);
    else byId.set(id, [item]);
  }
  const sections: SuggestionSection<T>[] = [];
  const ordered: T[] = [];
  for (const [id, list] of byId) {
    sections.push({ id, start: ordered.length, items: list });
    ordered.push(...list);
  }
  return { ordered, sections };
}

/**
 * The next highlighted row. Rows `0 … count - 1` are the items and `count`
 * is the "Close menu" row under them: the walk is one cycle through all of
 * them, so ArrowUp on the first item reaches "Close menu" and ArrowDown from
 * it wraps to the first item. With no item, only the close row is reachable.
 * A current index of -1 (nothing highlighted) starts from the top or the
 * bottom.
 */
export function stepSuggestion(current: number, count: number, direction: "up" | "down"): number {
  const rows = count + 1;
  if (current < 0 || current >= rows) return direction === "down" ? 0 : count;
  return direction === "down" ? (current + 1) % rows : (current - 1 + rows) % rows;
}

/** The section of a mention list, by the type of what it cites. */
export type MentionSectionId =
  | "people"
  | "projects"
  | "issues"
  | "objectives"
  | "pages"
  | "resources"
  | "dates"
  | "pullRequests"
  | "routines"
  | "skills"
  | "mcp"
  | "planning"
  | "semantic";

/** Numo, members and forge accounts are all people one can cite; issues
    found by meaning keep their own "Related by meaning" section. */
export function mentionSection(option: { type: string; semantic?: boolean }): MentionSectionId | null {
  if (option.semantic) return "semantic";
  switch (option.type) {
    case "numo":
    case "member":
    case "forge":
      return "people";
    case "project":
      return "projects";
    case "issue":
      return "issues";
    case "objective":
      return "objectives";
    case "page":
      return "pages";
    case "resource":
      return "resources";
    case "date":
      return "dates";
    case "pull_request":
      return "pullRequests";
    case "routine":
      return "routines";
    case "skill":
      return "skills";
    case "mcp":
      return "mcp";
    // The notebook and the cycles: where one plans one's own work.
    case "scratchpad":
    case "cycle":
      return "planning";
    default:
      return null;
  }
}
