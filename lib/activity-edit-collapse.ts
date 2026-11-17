// One activity entry per editing session (scratchpad request, Nov 2026).
//
// Text fields save as you type: a description, a plan or a page records an
// edit at each pause, so ten minutes of writing left ten to twenty identical
// "edited the description" lines. Here a person's run of edits to the same
// text field reads as ONE entry, the latest, as long as each edit follows the
// previous one within `EDIT_SESSION_GAP_MS`. A comment always ends the run
// (the conversation is what the edits answer), and so does a change of actor
// or of channel: "Numo edited after me" is exactly what the feed must say.

import type { IssueEvent } from "./types";

/** Two edits further apart than this are two sessions, two entries. */
export const EDIT_SESSION_GAP_MS = 30 * 60_000;

/** The fields whose every save is an event, and which are written by typing. */
const TEXT_FIELDS = new Set(["title", "description", "plan", "name", "body", "team_response"]);

type CollapsibleItem =
  | { kind: "event"; at: string; event: IssueEvent }
  | { kind: string; at: string };

function isEventItem(item: CollapsibleItem): item is { kind: "event"; at: string; event: IssueEvent } {
  return item.kind === "event";
}

/** The identity of a text edit run, or null for any other event. */
function editKey(event: IssueEvent): string | null {
  const text =
    (event.type === "updated" && !!event.field && TEXT_FIELDS.has(event.field)) ||
    event.type === "page_updated";
  if (!text) return null;
  return [
    event.type,
    event.field ?? "",
    event.actor_id ?? "",
    event.via_assistant ? "numo" : "",
    event.via_mcp ? `mcp:${event.api_key_id ?? ""}` : "",
    event.integration_id ?? "",
  ].join("|");
}

/**
 * The items with each run of text edits collapsed into its latest edit, in
 * the order they came (ascending or descending). The kept entry carries the
 * run's first `from_value`, so a "from → to" reading spans the session.
 */
export function collapseTextEdits<T extends CollapsibleItem>(items: readonly T[]): T[] {
  if (items.length < 2) return [...items];
  const time = (item: T) => Date.parse(item.at);
  const descending = time(items[0]) > time(items[items.length - 1]);
  const chronological = descending ? [...items].reverse() : [...items];

  const kept: (T | null)[] = [];
  // Open runs: key → index in `kept` of the run's latest edit.
  const open = new Map<string, number>();
  for (const item of chronological) {
    if (!isEventItem(item)) {
      if (item.kind === "comment") open.clear();
      kept.push(item);
      continue;
    }
    const key = editKey(item.event);
    if (key === null) {
      kept.push(item);
      continue;
    }
    const previousIndex = open.get(key);
    const previous = previousIndex === undefined ? null : kept[previousIndex];
    if (
      previous &&
      isEventItem(previous) &&
      time(item) - time(previous) <= EDIT_SESSION_GAP_MS
    ) {
      kept[previousIndex!] = null;
      const merged = {
        ...item,
        event: { ...item.event, from_value: previous.event.from_value },
      } as T;
      open.set(key, kept.length);
      kept.push(merged);
      continue;
    }
    open.set(key, kept.length);
    kept.push(item);
  }
  const result = kept.filter((item): item is T => item !== null);
  return descending ? result.reverse() : result;
}
