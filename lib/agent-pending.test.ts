import { describe, expect, it } from "vitest";
import { unechoedMessages } from "./agent-pending";

/**
 * Optimistic agent chat bubbles. What is locked here is
 * the complete life cycle of a follow-up message: it appears WHEN SENDING, remains
 * visible until the loop has drained it, and disappears QUITE when its echo
 * arrives — without a duplicate, and without being swallowed by an identical older message.
 */

describe("unechoedMessages", () => {
  it("displays the message as soon as it is sent, before any server echo", () => {
    // The real scenario: session at rest (the agent has just responded), the user
    // send a follow-up. The thread only contains the launch prompt and the
    // answer ; the new message is not yet an event.
    expect(unechoedMessages(["ajoute des tests"], ["Travaille sur MIN-68"])).toEqual([
      "ajoute des tests",
    ]);
  });

  it("removes the bubble when its echo arrives (no duplicate)", () => {
    expect(
      unechoedMessages(["ajoute des tests"], ["Travaille sur MIN-68", "ajoute des tests"]),
    ).toEqual([]);
  });

  it("keeps TWO bubbles for two identical sends and removes only one per echo", () => {
    // The case that breaks a simple “does this text already exist?” »: without counting, the
    // 1st echo would make both bubbles disappear at once.
    expect(unechoedMessages(["continue", "continue"], [])).toEqual(["continue", "continue"]);
    expect(unechoedMessages(["continue", "continue"], ["continue"])).toEqual(["continue"]);
    expect(unechoedMessages(["continue", "continue"], ["continue", "continue"])).toEqual([]);
  });

  it("is not swallowed by an identical message that already failed earlier", () => {
    // “ok” sent in round 1 (already failed), then “ok” again in round 2. The
    // list `pending` being never purged, it carries both: subtraction
    // leave the new bubble well.
    expect(unechoedMessages(["ok", "ok"], ["ok"])).toEqual(["ok"]);
  });

  it("ignore les espaces de bord (l'écho est normalisé côté serveur)", () => {
    expect(unechoedMessages(["  relance  "], ["relance"])).toEqual([]);
  });

  it("n'affiche rien quand rien n'a été envoyé", () => {
    expect(unechoedMessages([], ["Travaille sur MIN-68"])).toEqual([]);
  });

  it("laisse passer un envoi qui n'a rien à voir avec les échos", () => {
    expect(unechoedMessages(["b"], ["a", "c"])).toEqual(["b"]);
  });
});

/**
 * PR 52 — MENTIONS TRAVEL WITH THEIR MESSAGE.
 *
 * A pending message does not just carry text: it carries the ids of what it
 * cites. Finding them afterwards by equality of text gave the pills of the
 * first “ok” to the second — the one who cited a ticket.
 */
describe("les objets en attente, pas leurs textes", () => {
  it("rend le message ENTIER, mentions comprises", () => {
    const pending = [
      { text: "ok", mentions: [] },
      { text: "ok", mentions: [{ type: "issue", id: "i-1", label: "MIN-7" }] },
    ];
    expect(unechoedMessages(pending, [])).toEqual(pending);
  });

  it("ne consomme QU'UN homonyme par écho, et garde le bon", () => {
    const pending = [
      { text: "ok", mentions: [] },
      { text: "ok", mentions: [{ type: "issue", id: "i-1", label: "MIN-7" }] },
    ];
    // The first “ok” came back from the server: it’s HE who leaves, and the one who
    // reste garde ses mentions.
    expect(unechoedMessages(pending, ["ok"])).toEqual([pending[1]]);
  });
});
