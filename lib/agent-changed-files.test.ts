import { describe, expect, it } from "vitest";
import {
  cumulativeBranchFiles,
  hasCommittedChanges,
  mergeLiveFileStats,
} from "./agent-changed-files";
import { parseFilesChangedPayload, type AgentFileChange, type AgentRunEvent } from "./agent-api";

let seq = 0;
function ev(type: AgentRunEvent["type"], payload: Record<string, unknown> | null): AgentRunEvent {
  seq += 1;
  return { id: `e${seq}`, seq, type, payload, created_at: "" };
}
describe("parseFilesChangedPayload", () => {
  it("normalise une charge valide", () => {
    const parsed = parseFilesChangedPayload({
      files: [
        { path: "a.ts", status: "added", additions: 3, deletions: 0 },
        { path: "b.ts", status: "renamed", additions: 1, deletions: 1, previousPath: "old.ts" },
      ],
      truncated: true,
    });
    expect(parsed.truncated).toBe(true);
    expect(parsed.files).toHaveLength(2);
    expect(parsed.files[1].previousPath).toBe("old.ts");
  });

  it("tolère les formes partielles (statut inconnu → modified, compteurs → 0)", () => {
    const parsed = parseFilesChangedPayload({
      files: [{ path: "a.ts", status: "weird" }, { nope: true }, "bad"],
    });
    expect(parsed.truncated).toBe(false);
    expect(parsed.files).toEqual([{ path: "a.ts", status: "modified", additions: 0, deletions: 0 }]);
  });

  it("null → vide", () => {
    expect(parseFilesChangedPayload(null)).toEqual({ files: [], truncated: false });
  });
});

describe("cumulativeBranchFiles", () => {
  it("fusionne les events files_changed (dernier statut par chemin gagne)", () => {
    const { files, truncated } = cumulativeBranchFiles([
      ev("files_changed", {
        files: [{ path: "a.ts", status: "added", additions: 5, deletions: 0 }],
      }),
      ev("thinking", { text: "…" }),
      ev("files_changed", {
        files: [
          { path: "a.ts", status: "modified", additions: 2, deletions: 1 },
          { path: "b.ts", status: "deleted", additions: 0, deletions: 9 },
        ],
        truncated: true,
      }),
    ]);
    expect(truncated).toBe(true);
    const a = files.find((f) => f.path === "a.ts");
    expect(a).toMatchObject({ status: "modified", additions: 2, deletions: 1 });
    expect(files.map((f) => f.path).sort()).toEqual(["a.ts", "b.ts"]);
  });

  it("aucun event → vide", () => {
    expect(cumulativeBranchFiles([ev("thinking", { text: "x" })])).toEqual({
      files: [],
      truncated: false,
    });
  });
});

describe("hasCommittedChanges", () => {
  it("vrai dès qu'un event files_changed existe", () => {
    expect(hasCommittedChanges([ev("files_changed", { files: [] })])).toBe(true);
    expect(hasCommittedChanges([ev("thinking", { text: "x" })])).toBe(false);
  });
});

describe("mergeLiveFileStats", () => {
  it("injecte les compteurs Git dans les seuls fichiers du tour en cours", () => {
    const liveFiles: AgentFileChange[] = [
      { path: "src/a.ts", status: "modified", additions: 0, deletions: 0 },
      { path: "src/new.ts", status: "modified", additions: 0, deletions: 0 },
    ];
    const diffFiles = [
      { filename: "src/a.ts", additions: 4, deletions: 2 },
      { filename: "src/previous.ts", additions: 9, deletions: 1 },
    ];

    expect(mergeLiveFileStats(liveFiles, diffFiles)).toEqual([
      { path: "src/a.ts", status: "modified", additions: 4, deletions: 2 },
      { path: "src/new.ts", status: "modified", additions: 0, deletions: 0 },
    ]);
    expect(liveFiles[0].additions).toBe(0);
  });

  it("reconnaît le chemin précédent d'un renommage", () => {
    const live: AgentFileChange[] = [
      { path: "old.ts", status: "modified", additions: 0, deletions: 0 },
    ];
    const diff = [
      {
        filename: "new.ts",
        previous_filename: "old.ts",
        additions: 3,
        deletions: 1,
      },
    ];

    expect(mergeLiveFileStats(live, diff)[0]).toMatchObject({ additions: 3, deletions: 1 });
  });
});
