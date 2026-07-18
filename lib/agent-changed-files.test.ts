import { describe, expect, it } from "vitest";
import {
  cumulativeBranchFiles,
  hasCommittedChanges,
  liveTurnFiles,
} from "./agent-changed-files";
import { parseFilesChangedPayload, type AgentRunEvent } from "./agent-api";

let seq = 0;
function ev(type: AgentRunEvent["type"], payload: Record<string, unknown> | null): AgentRunEvent {
  seq += 1;
  return { id: `e${seq}`, seq, type, payload, created_at: "" };
}
function toolCall(name: string, extra: Record<string, unknown>): AgentRunEvent {
  return ev("tool_call", { id: `tc${seq}`, name, ...extra });
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

describe("liveTurnFiles", () => {
  it("mappe chaque tool d'édition vers son statut", () => {
    const files = liveTurnFiles([
      toolCall("write_file", { path: "new.ts" }),
      toolCall("edit_file", { path: "edit.ts" }),
      toolCall("delete_file", { path: "gone.ts" }),
      toolCall("move_file", { from: "old.ts", to: "moved.ts" }),
      toolCall("apply_edits", { count: 2, paths: ["batch1.ts", "batch2.ts"] }),
      toolCall("read_file", { path: "ignored.ts" }),
      toolCall("run_command", { command: "ls" }),
    ]);
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.status]));
    expect(byPath).toEqual({
      "new.ts": "added",
      "edit.ts": "modified",
      "gone.ts": "deleted",
      "moved.ts": "renamed",
      "batch1.ts": "modified",
      "batch2.ts": "modified",
    });
    // read_file / run_command ne produisent pas d'entrée.
    expect(files.some((f) => f.path === "ignored.ts")).toBe(false);
    // Le renommage porte son chemin d'origine.
    expect(files.find((f) => f.path === "moved.ts")?.previousPath).toBe("old.ts");
  });

  it("ne rétrograde pas un fichier créé puis édité en 'modified'", () => {
    const files = liveTurnFiles([
      toolCall("write_file", { path: "x.ts" }),
      toolCall("edit_file", { path: "x.ts" }),
    ]);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe("added");
  });

  it("ne regarde que le tour EN COURS (après la dernière frontière)", () => {
    const files = liveTurnFiles([
      toolCall("write_file", { path: "old-turn.ts" }),
      ev("summary", { text: "fini" }),
      ev("user_message", { text: "encore" }),
      toolCall("edit_file", { path: "current.ts" }),
    ]);
    expect(files.map((f) => f.path)).toEqual(["current.ts"]);
  });

  it("compteurs inconnus en live → 0", () => {
    const files = liveTurnFiles([toolCall("write_file", { path: "x.ts" })]);
    expect(files[0]).toMatchObject({ additions: 0, deletions: 0 });
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
