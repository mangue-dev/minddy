import { describe, expect, it } from "vitest";
import { collapseTextEdits, EDIT_SESSION_GAP_MS } from "./activity-edit-collapse";
import type { IssueEvent } from "./types";

const base = Date.parse("2026-11-17T10:00:00Z");
const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();

function edit(id: string, minutes: number, patch: Partial<IssueEvent> = {}) {
  const event = {
    id,
    issue_id: "issue",
    actor_id: "alice",
    type: "updated",
    field: "description",
    from_value: `before-${id}`,
    to_value: `after-${id}`,
    created_at: at(minutes),
    ...patch,
  } as IssueEvent;
  return { kind: "event" as const, at: event.created_at, event };
}
const comment = (minutes: number) => ({ kind: "comment" as const, at: at(minutes) });
const ids = (items: { kind: string }[]) =>
  items.map((item) => ("event" in item ? (item as { event: IssueEvent }).event.id : item.kind));

describe("collapseTextEdits", () => {
  it("keeps one entry for a session of edits, the latest, with the first from_value", () => {
    const result = collapseTextEdits([edit("a", 0), edit("b", 2), edit("c", 5)]);
    expect(ids(result)).toEqual(["c"]);
    expect((result[0] as ReturnType<typeof edit>).event.from_value).toBe("before-a");
  });

  it("works on a feed sorted newest first", () => {
    expect(ids(collapseTextEdits([edit("c", 5), edit("b", 2), edit("a", 0)]))).toEqual(["c"]);
  });

  it("splits sessions further apart than the gap", () => {
    const gap = EDIT_SESSION_GAP_MS / 60_000 + 1;
    expect(ids(collapseTextEdits([edit("a", 0), edit("b", gap)]))).toEqual(["a", "b"]);
  });

  it("never merges across a comment, another actor, Numo or another field", () => {
    expect(ids(collapseTextEdits([edit("a", 0), comment(1), edit("b", 2)]))).toEqual(["a", "comment", "b"]);
    expect(ids(collapseTextEdits([edit("a", 0), edit("b", 1, { actor_id: "bob" })]))).toEqual(["a", "b"]);
    expect(ids(collapseTextEdits([edit("a", 0), edit("b", 1, { via_assistant: true })]))).toEqual(["a", "b"]);
    expect(ids(collapseTextEdits([edit("a", 0), edit("b", 1, { field: "plan" })]))).toEqual(["a", "b"]);
  });

  it("merges across other events, and leaves those events alone", () => {
    const status = edit("s", 1, { field: "status" });
    expect(ids(collapseTextEdits([edit("a", 0), status, edit("b", 2)]))).toEqual(["s", "b"]);
    expect(ids(collapseTextEdits([status, edit("t", 2, { field: "status" })]))).toEqual(["s", "t"]);
  });

  it("collapses page saves", () => {
    const page = (id: string, minutes: number) =>
      edit(id, minutes, { type: "page_updated", field: "human", issue_id: null, page_id: "p" });
    expect(ids(collapseTextEdits([page("a", 0), page("b", 4), page("c", 9)]))).toEqual(["c"]);
  });
});
