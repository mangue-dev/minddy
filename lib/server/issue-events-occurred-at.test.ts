import { describe, expect, it } from "vitest";
import { stampOccurredAt, type EventRow } from "@/lib/server/issue-events";

/**
 * `stampOccurredAt` — l'horodatage d'un événement, c'est l'instant du GESTE.
 *
 * Un événement différé (`after()`) s'insère quelques centaines de millisecondes
 * après le geste qui l'a produit, et pendant ce temps d'autres écritures — Smart
 * Assign, les relations — passent devant. Sans cet horodatage figé, la timeline
 * classe par ordre d'ÉCRITURE : « a assigné » avant « a changé le statut ».
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
    // Le reste de la ligne est intact — l'estampille s'ajoute, elle ne réécrit pas.
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
