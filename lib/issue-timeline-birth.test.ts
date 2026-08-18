import { describe, expect, it } from "vitest";
import { buildTimelineItems } from "@/lib/use-issue-timeline";
import type { Comment, IssueEvent } from "@/lib/types";

/**
 * A TICKET'S TIMELINE STARTS WITH ITS BIRTH — always.
 *
 * The event `created` is a separate write, and a separate write can
 * miss: it failed, or the line was born from a direct insert (the world de
 * demo). The ticket always knows when it was born — it's its own
 * column. Without the fallback tested here, these tickets display "No activity",
 * which is false for any ticket that exists.
 *
 * The fallback is a FALLBACK: as soon as the log bears its birth line
 * (`created` or `imported`), it is she who speaks, and nothing is duplicated.
 */

const BIRTH = { createdAt: "2026-08-10T10:00:00+00:00", createdBy: "member-1" };

const event = (over: Partial<IssueEvent> & { created_at: string }): IssueEvent => ({
  id: `e-${over.created_at}`,
  issue_id: "issue-1",
  actor_id: "member-1",
  type: "updated",
  field: "status",
  from_value: null,
  to_value: null,
  ...over,
});

const comment = (createdAt: string): Comment =>
  ({
    id: `c-${createdAt}`,
    issue_id: "issue-1",
    author_id: "member-1",
    body: "hello",
    parent_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  }) as Comment;

const kinds = (items: ReturnType<typeof buildTimelineItems>) =>
  items.map((i) => (i.kind === "event" ? `${i.event.type}@${i.at}` : `comment@${i.at}`));

describe("buildTimelineItems — la ligne de naissance", () => {
  it("reconstructs « created » when the log does not contain it", () => {
    const items = buildTimelineItems({
      events: [event({ created_at: "2026-08-10T11:00:00+00:00" })],
      comments: [],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(kinds(items)).toEqual([
      "created@2026-08-10T10:00:00+00:00",
      "updated@2026-08-10T11:00:00+00:00",
    ]);
    expect(items[0].kind === "event" && items[0].event.actor_id).toBe("member-1");
  });

  it("gives a ticket with no events anything to read", () => {
    const items = buildTimelineItems({
      events: [],
      comments: [],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(kinds(items)).toEqual(["created@2026-08-10T10:00:00+00:00"]);
  });

  it("does not duplicate an already logged birth", () => {
    const created = event({
      created_at: "2026-08-10T10:00:02+00:00",
      type: "created",
      field: null,
    });
    const items = buildTimelineItems({
      events: [created],
      comments: [],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(kinds(items)).toEqual(["created@2026-08-10T10:00:02+00:00"]);
  });

  it("also treats an IMPORTED ticket as born", () => {
    const imported = event({
      created_at: "2026-08-10T10:00:02+00:00",
      type: "imported",
      field: null,
    });
    const items = buildTimelineItems({
      events: [imported],
      comments: [],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(kinds(items)).toEqual(["imported@2026-08-10T10:00:02+00:00"]);
  });

  it("waits for loading before collapsing", () => {
    // `undefined` = in-flight request. A birthline displayed here would be
    // replaced a fraction of a second later by the real one.
    const items = buildTimelineItems({
      events: undefined,
      comments: [],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(items).toEqual([]);
  });

  it("orders comments and events at the same instant regardless of time formatting", () => {
    // `+00:00` of PostgREST against `Z` of a client ISO: same moment, two
    // typographies — a STRING sort would put the `Z` last.
    const items = buildTimelineItems({
      events: [event({ created_at: "2026-08-10T12:00:00.000Z" })],
      comments: [comment("2026-08-10T12:00:01+00:00")],
      issueId: "issue-1",
      birth: BIRTH,
    });

    expect(kinds(items)).toEqual([
      "created@2026-08-10T10:00:00+00:00",
      "updated@2026-08-10T12:00:00.000Z",
      "comment@2026-08-10T12:00:01+00:00",
    ]);
  });
});
