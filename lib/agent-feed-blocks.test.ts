import { describe, expect, it } from "vitest";

import { buildBlocks } from "./agent-feed-blocks";
import type { FeedItem } from "@/components/agent/agent-event-feed";

/**
 * CUTTING THE WIRE INTO TURNS: what opens a turn, what closes it, and what
 * only lays underneath. One turn = one accordion = ONE timer on the screen, and
 * it is this last equality that the sequel keeps (it has already broken: the list
 * of live files created a second accordion under the response).
 */

const T = "2026-08-13T10:00:00.000Z";

function message(id: string, opts: { summary?: boolean; user?: boolean } = {}): FeedItem {
  return {
    kind: "message",
    message: {
      id,
      conversation_id: "",
      role: opts.user ? "user" : "assistant",
      content: id,
      tool_calls: null,
      tool_call_id: null,
      tool_name: null,
      metadata: {},
      created_at: "",
    },
    createdAt: T,
    isSummary: opts.summary,
  };
}

function files(id: string, live?: boolean): FeedItem {
  return {
    kind: "files",
    id,
    files: [{ path: "lib/a.ts", status: "modified", additions: 0, deletions: 0 }],
    truncated: false,
    createdAt: T,
    live,
  };
}

/** MIN-358's note: the tour commit took files from the human. */
function overlap(id: string, count = 1): FeedItem {
  return { kind: "note", id, variant: "currentRepoOverlap", count, text: "", createdAt: T };
}

const reasoning: FeedItem = {
  kind: "reasoning",
  id: "r1",
  active: true,
  durationMs: 1200,
  text: "",
  createdAt: T,
};

const turns = (blocks: ReturnType<typeof buildBlocks>) => blocks.filter((b) => b.type === "turn");

describe("buildBlocks", () => {
  it("replie le travail d'un tour dans UN bloc, sa réponse dessous", () => {
    const blocks = buildBlocks([reasoning, message("answer", { summary: true })], false);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "turn", active: false, work: [reasoning] });
  });

  it("n'ouvre PAS un second tour sur la liste de fichiers vivante qui suit la réponse", () => {
    // The case of the bug: the direct only releases the list at the end of `files_changed`
    // tour, so it arrives behind the summary. Row like a new round, it
    // displayed a SECOND accordion under the answer, with its own timer.
    const blocks = buildBlocks(
      [reasoning, message("answer", { summary: true }), files("live-files", true)],
      true,
    );
    expect(turns(blocks)).toHaveLength(1);
    expect(blocks[blocks.length - 1]).toEqual({ type: "loose", item: files("live-files", true) });
  });

  it("the END-OF-TURN file block is placed under that turn's response", () => {
    const blocks = buildBlocks(
      [reasoning, message("answer", { summary: true }), files("f1")],
      false,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "turn", files: [files("f1")] });
  });

  it("un tour EN COURS reste actif tant qu'il a du vrai travail", () => {
    const blocks = buildBlocks([reasoning, files("live-files", true)], true);
    expect(turns(blocks)).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "turn", active: true, endedAt: null });
  });

  it("a stopped turn without a conclusion keeps its accordion marked interrupted", () => {
    const blocks = buildBlocks([reasoning], false);
    expect(blocks[0]).toMatchObject({ type: "turn", active: false, interrupted: true });
  });

  it("a user message separates turns: unsummarized work is laid out expanded", () => {
    const blocks = buildBlocks(
      [reasoning, message("u1", { user: true }), message("answer", { summary: true })],
      false,
    );
    // The paused tour has not concluded: it remains unfolded, and only what follows the
    // message user forms the next round — here a single response, therefore free too.
    expect(blocks.map((b) => b.type)).toEqual(["loose", "loose", "loose"]);
  });
});

/**
 * MIN-293 — THE “INTERRUPTED” GHOST TOUR, seen on a real local run.
 *
 * `current_repo_overlap` (MIN-358) comes AFTER the summary, like `files_changed`.
 * As long as it was not recognized as a conclusion of a round, it counted as
 * WORK: it reopened a round on its own, which nothing ever closed, and
 * the thread displayed "Turn interrupted" under a round which had just succeeded.
 *
 * The fault was only visible in current deposit mode - therefore only on a run
 * local, which explains why he went through the entire suite without being seen.
 */
describe("what arrives AFTER the summary is placed under the turn", () => {
  it("does not create a second « interrupted » turn for an overlap", () => {
    // The exact sequence of run f1be4a59: job, summary, overlap, files.
    const blocks = buildBlocks(
      [reasoning, message("summary", { summary: true }), overlap("ov"), files("fc")],
      false,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "turn", active: false });
    expect(blocks[0]).not.toHaveProperty("interrupted", true);
  });

  it("places the overlap UNDER the response with the changed files", () => {
    const blocks = buildBlocks(
      [reasoning, message("summary", { summary: true }), overlap("ov"), files("fc")],
      false,
    );
    const turn = blocks[0] as Extract<ReturnType<typeof buildBlocks>[number], { type: "turn" }>;
    expect(
      turn.files.map((f) => (f.kind === "note" ? f.variant : f.kind)),
    ).toEqual(["currentRepoOverlap", "files"]);
  });

  it("laisse un chevauchement ORPHELIN en item libre, sans inventer de tour", () => {
    // No turn in front of him (reloading in the middle of the wire): he shows himself as
    // what rather than opening an empty accordion.
    const blocks = buildBlocks([overlap("ov")], false);
    expect(blocks).toEqual([{ type: "loose", item: overlap("ov") }]);
  });

  it("keeps « interrupted » on a genuinely stopped turn — the line is still useful", () => {
    // What the fix should not take away: a stopped lap without response said
    // always why the answer is missing.
    const blocks = buildBlocks([reasoning], false);
    expect(blocks[0]).toMatchObject({ type: "turn", active: false, interrupted: true });
  });
});
