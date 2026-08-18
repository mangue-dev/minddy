import { describe, expect, it } from "vitest";
import { turnSubagents } from "./agent-subagents";
import type { AgentRunEvent } from "./agent-api";

/**
 * What the card above the composer reads to say "it's still running."
 *
 * Two cases carry everything else. A CUT daughter issues neither summary nor error —
 * only the parent announces the delivery of her report: without this reading, she
 * would remain "at work" forever, and the card would lie exactly where
 * it is supposed to reassure. And the window is the TURN, not the session: the girls
 * from a past turn have already given in, listing them would make the card grow with each
 * delegation of the conversation.
 */

let seq = 0;
function ev(
  type: AgentRunEvent["type"],
  payload: Record<string, unknown>,
  createdAt = "2026-08-08T10:00:00.000Z",
): AgentRunEvent {
  seq += 1;
  return { id: `e${seq}`, seq, type, payload, created_at: createdAt };
}

describe("turnSubagents", () => {
  it("renders a launched child without an end time while it is running", () => {
    expect(
      turnSubagents([
        ev("tool_call", { name: "spawn_agent", id: "t1" }),
        ev("thinking", { subagent_id: "sub-1", subagent_mode: "explore", text: "je regarde" }),
        ev("tool_call", { subagent_id: "sub-1", name: "grep", id: "t2" }),
      ]),
    ).toEqual([
      expect.objectContaining({ id: "sub-1", mode: "explore", endedAt: null }),
    ]);
  });

  it("freezes the child that returned its summary and keeps the other running", () => {
    const found = turnSubagents([
      ev("thinking", { subagent_id: "sub-1", subagent_mode: "explore", text: "…" }),
      ev("thinking", { subagent_id: "sub-2", subagent_mode: "implement", text: "…" }),
      ev("summary", { subagent_id: "sub-1", text: "rapport" }, "2026-08-08T10:02:00.000Z"),
    ]);
    expect(found).toEqual([
      expect.objectContaining({ id: "sub-1", endedAt: "2026-08-08T10:02:00.000Z" }),
      expect.objectContaining({ id: "sub-2", endedAt: null }),
    ]);
  });

  it("freezes a failed child", () => {
    const [sub] = turnSubagents([
      ev("thinking", { subagent_id: "sub-1", text: "…" }),
      ev("error", { subagent_id: "sub-1", message: "boum" }, "2026-08-08T10:01:00.000Z"),
    ]);
    expect(sub.endedAt).toBe("2026-08-08T10:01:00.000Z");
  });

  it("freezes a STOPPED child, which only the parent declares delivered", () => {
    // Neither summary nor error: a suspended loop emits none. This is the event
    // `status` of the PARENT which closes the line.
    const [sub] = turnSubagents([
      ev("thinking", { subagent_id: "sub-1", text: "…" }),
      ev(
        "status",
        { phase: "subagent_report", id: "sub-1", partial: true },
        "2026-08-08T10:03:00.000Z",
      ),
    ]);
    expect(sub.endedAt).toBe("2026-08-08T10:03:00.000Z");
  });

  it("forgets children from the PREVIOUS turn — the parent's response closes it", () => {
    expect(
      turnSubagents([
        ev("thinking", { subagent_id: "sub-1", text: "…" }),
        ev("summary", { subagent_id: "sub-1", text: "rapport" }),
        // The PARENT responds: the round is over, with all the above.
        ev("summary", { text: "voilà ce que j'ai trouvé" }),
        ev("user_message", { text: "continue" }),
        ev("thinking", { subagent_id: "sub-2", subagent_mode: "implement", text: "…" }),
      ]).map((s) => s.id),
    ).toEqual(["sub-2"]);
  });

  it("returns children from oldest to newest", () => {
    expect(
      turnSubagents([
        ev("thinking", { subagent_id: "sub-2", text: "…" }, "2026-08-08T10:00:10.000Z"),
        ev("thinking", { subagent_id: "sub-1", text: "…" }, "2026-08-08T10:00:00.000Z"),
      ]).map((s) => s.id),
    ).toEqual(["sub-1", "sub-2"]);
  });
});
