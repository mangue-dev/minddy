import { describe, expect, it } from "vitest";
import { stampOccurredAt, type EventRow } from "@/lib/server/issue-events";

/**
 * `stampOccurredAt` — the timestamp of an event, this is the instant of the GESTURE.
 *
 * A delayed event (`after()`) is inserted a few hundred milliseconds
 * after the gesture that produced it, and during this time other writes — Smart
 * Assign, relationships — come first. Without this fixed timestamp, the timeline
 * sorts in WRITING order: “assigned” before “changed status”.
 */

const row = (over: Partial<EventRow> = {}): EventRow => ({
  issue_id: "issue-1",
  actor_id: "member-1",
  type: "updated",
  field: "status",
  ...over,
});

describe("stampOccurredAt", () => {
  it("pose l'instant sur chaque ligne du lot", () => {
    const at = "2026-08-10T10:00:00.000Z";
    const stamped = stampOccurredAt([row(), row({ field: "priority" })], at);

    expect(stamped.map((r) => r.created_at)).toEqual([at, at]);
    // The rest of the line is intact — the stamp is added, it does not rewrite.
    expect(stamped[0]).toMatchObject({ issue_id: "issue-1", type: "updated", field: "status" });
  });

  it("laisse la main à un instant déjà porté par la ligne", () => {
    const stamped = stampOccurredAt(
      [row({ created_at: "2026-01-01T00:00:00.000Z" })],
      "2026-08-10T10:00:00.000Z"
    );

    expect(stamped[0].created_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("ne touche pas au lot d'origine", () => {
    const original = [row()];
    stampOccurredAt(original, "2026-08-10T10:00:00.000Z");

    expect(original[0].created_at).toBeUndefined();
  });
});
