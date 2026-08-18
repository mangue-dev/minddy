import { describe, expect, it } from "vitest";

import { liveAfterEvent, liveFromStream, type AgentRunLive } from "./agent-live";

/**
 * The CLIENT half of the live thing: what the thread keeps, what it deletes, and when.
 *
 * The two rules that matter together hold a single promise — the
 * "changed files" block appears on the first edit and remains until the
 * git list replaces, once, without duplicates.
 */

const T0 = "2026-08-09T12:00:00.000Z";
const now = () => T0;

function withFiles(paths: string[]): AgentRunLive {
  return liveFromStream(
    null,
    { files: paths.map((path) => ({ path, status: "modified" })) },
    now,
  )!;
}

describe("liveFromStream", () => {
  it("compte les FICHIERS comme un signe de vie", () => {
    // An edition writes neither text nor tool-call moreover: the load which carries it
    // is that of a round at rest. Without this test, it read like a sending to
    // empty and erase the live tail instead of opening it.
    const live = liveFromStream(null, {
      files: [{ path: "lib/a.ts", status: "deleted" }],
      filesTruncated: true,
    }, now);
    expect(live).toEqual({
      text: "",
      tools: 0,
      reasoningActive: false,
      reasoningMs: 0,
      files: [{ path: "lib/a.ts", status: "deleted", additions: 0, deletions: 0 }],
      filesTruncated: true,
      fileStats: [],
      startedAt: T0,
    });
  });

  it("garde les compteurs Git locaux et les utilise aussi comme liste de secours", () => {
    const live = liveFromStream(null, {
      fileStats: [{ path: "components/agent/feed.tsx", status: "modified", additions: 12, deletions: 3 }],
    }, now);
    expect(live?.files).toEqual([
      { path: "components/agent/feed.tsx", status: "modified", additions: 12, deletions: 3 },
    ]);
    expect(live?.fileStats).toEqual(live?.files);
  });

  it("efface tout sur une charge VRAIMENT vide — c'est la purge du relais", () => {
    expect(liveFromStream(withFiles(["a.ts"]), { text: "" }, now)).toBeNull();
  });

  it("ne fusionne pas : la charge fait foi, y compris sur les fichiers", () => {
    // The server returns the entire list on each load. Merging would
    // survive a file that the round has stopped counting.
    const next = liveFromStream(withFiles(["a.ts", "b.ts"]), {
      text: "je continue",
      files: [{ path: "b.ts", status: "modified" }],
    }, now);
    expect(next?.files.map((f) => f.path)).toEqual(["b.ts"]);
  });

  it("garde le chrono du PREMIER signe de vie du round", () => {
    const next = liveFromStream(withFiles(["a.ts"]), { text: "suite" }, () => "2026-08-09T13:00:00.000Z");
    expect(next?.startedAt).toBe(T0);
  });
});

describe("liveAfterEvent", () => {
  it("efface le texte provisoire dès qu'un event est posé", () => {
    const next = liveAfterEvent(liveFromStream(null, { text: "brouillon" }, now), "summary");
    expect(next).toBeNull();
  });

  it("GARDE les fichiers sous un `tool_call` — la phase d'outils est celle où on les veut", () => {
    const next = liveAfterEvent(withFiles(["a.ts"]), "tool_call");
    expect(next?.files.map((f) => f.path)).toEqual(["a.ts"]);
    expect(next?.text).toBe("");
    expect(next?.tools).toBe(0);
  });

  it("les LÂCHE sur ce qui CLÔT le tour — la liste ne survit pas à la réponse", () => {
    // The live list belongs to the current round. When she survived him, the thread
    // placed it in a NEW round (it arrives after the summary) and displayed a
    // second accordion under the response, with its own timer.
    expect(liveAfterEvent(withFiles(["a.ts"]), "summary")).toBeNull();
    expect(liveAfterEvent(withFiles(["a.ts"]), "quota_exhausted")).toBeNull();
  });

  it("les LÂCHE sur `files_changed` : l'autorité est arrivée", () => {
    // The handover is decided here, and not on a purge load: when the
    // loop runs in the microVM, the event is set after the round has returned
    // report and no one broadcasts anything anymore. The two lists overlapped
    // until the end of the run — the same, twice, one without its counters.
    expect(liveAfterEvent(withFiles(["a.ts"]), "files_changed")).toBeNull();
  });
});
