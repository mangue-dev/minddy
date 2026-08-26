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
    expect(unechoedMessages(["add tests"], ["Work on MIN-68"])).toEqual([
      "add tests",
    ]);
  });

  it("removes the bubble when its echo arrives (no duplicate)", () => {
    expect(
      unechoedMessages(["add tests"], ["Work on MIN-68", "add tests"]),
    ).toEqual([]);
  });

  it("keeps TWO bubbles for two identical sends and removes only one per echo", () => {
    // This breaks a simple “does this text already exist?” check: without
    // counting, the first echo would make both bubbles disappear at once.
    expect(unechoedMessages(["continue", "continue"], [])).toEqual([
      "continue",
      "continue",
    ]);
    expect(unechoedMessages(["continue", "continue"], ["continue"])).toEqual([
      "continue",
    ]);
    expect(
      unechoedMessages(["continue", "continue"], ["continue", "continue"]),
    ).toEqual([]);
  });

  it("is not swallowed by an identical message that already failed earlier", () => {
    // “ok” was sent in round 1, then again in round 2. The pending list is
    // never purged, so subtraction must retain the newer bubble.
    expect(unechoedMessages(["ok", "ok"], ["ok"])).toEqual(["ok"]);
  });

  it("ignores surrounding whitespace normalized by the server", () => {
    expect(unechoedMessages(["  restart  "], ["restart"])).toEqual([]);
  });

  it("displays nothing when nothing was sent", () => {
    expect(unechoedMessages([], ["Work on MIN-68"])).toEqual([]);
  });

  it("keeps a send unrelated to existing echoes", () => {
    expect(unechoedMessages(["b"], ["a", "c"])).toEqual(["b"]);
  });

  it("correlates identical messages by durable queue id", () => {
    const pending = [
      { id: "message-new", text: "continue" },
      { id: "message-later", text: "continue" },
    ];
    expect(
      unechoedMessages(pending, [{ id: "message-later", text: "continue" }]),
    ).toEqual([pending[0]]);
  });

  it("correlates a combined question answer by every queue id", () => {
    const pending = [
      { id: "answer-1", text: "first" },
      { id: "answer-2", text: "second" },
    ];
    expect(
      unechoedMessages(pending, [
        { ids: ["answer-1", "answer-2"], text: "first\n\nsecond" },
      ]),
    ).toEqual([]);
  });
});

/**
 * PR 52 — MENTIONS TRAVEL WITH THEIR MESSAGE.
 *
 * A pending message does not just carry text: it carries the ids of what it
 * cites. Finding them afterwards by equality of text gave the pills of the
 * first “ok” to the second — the one who cited a ticket.
 */
describe("pending objects rather than only their text", () => {
  it("returns the complete message including mentions", () => {
    const pending = [
      { text: "ok", mentions: [] },
      { text: "ok", mentions: [{ type: "issue", id: "i-1", label: "MIN-7" }] },
    ];
    expect(unechoedMessages(pending, [])).toEqual(pending);
  });

  it("consumes only one matching message per echo", () => {
    const pending = [
      { text: "ok", mentions: [] },
      { text: "ok", mentions: [{ type: "issue", id: "i-1", label: "MIN-7" }] },
    ];
    // The first “ok” came back from the server; the remaining one keeps its mentions.
    expect(unechoedMessages(pending, ["ok"])).toEqual([pending[1]]);
  });
});
