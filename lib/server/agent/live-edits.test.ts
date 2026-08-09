import { describe, expect, it } from "vitest";

import { makeExecTool, type AgentLiveEdit } from "./exec-tool";
import { REPO_DIR, type RepoHost } from "./repo-host";

/**
 * `onEdit` — ce que le fil apprend d'une édition AVANT la fin du tour.
 *
 * La liste autoritaire (`files_changed`) est dérivée de git, en fin de tour : elle
 * arrive une fois, tard, et c'est tout le problème qu'on répare. Celle-ci est
 * provisoire, mais elle ne doit pas pour autant raconter n'importe quoi — un
 * fichier supprimé ne s'annonce pas « modifié », et un renommage garde d'où il
 * vient. Ce qu'on ne SAIT pas (créé vs modifié) reste à `modified` : git tranchera.
 */

function fakeHost(files: Record<string, string>): RepoHost {
  const map = new Map(Object.entries(files).map(([p, c]) => [`${REPO_DIR}/${p}`, c]));
  return {
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: async (abs) => map.get(abs) ?? null,
    writeFile: async (abs, content) => {
      map.set(abs, content);
    },
    mkdir: async () => {},
  };
}

/** L'exec-tool et le journal de ce qu'il a dit au fil. */
function execToolFor(files: Record<string, string>) {
  const seen: AgentLiveEdit[][] = [];
  const exec = makeExecTool({
    host: fakeHost(files),
    createPr: null,
    prTool: null,
    issueTool: null,
    scratchpadTool: null,
    webSearch: null,
    outputSeqBase: 0,
    background: null,
    instructions: { paths: [], bytes: 0 },
    editedPaths: new Set<string>(),
    subagents: null,
    chunkRemainingMs: () => 120_000,
    onEdit: (edits) => seen.push(edits),
  });
  return { exec, seen };
}

const FILE = "a.ts";

describe("onEdit — le fil prévenu à l'édition, pas au commit", () => {
  it("annonce une écriture dès qu'elle a réussi", async () => {
    const { exec, seen } = execToolFor({ [FILE]: "const a = 1;\n" });
    await exec("write_file", { path: FILE, content: "const a = 2;\n" }, "c1");
    expect(seen).toEqual([[{ path: FILE, status: "modified" }]]);
  });

  it("dit une SUPPRESSION, au lieu de la faire passer pour une modification", async () => {
    const { exec, seen } = execToolFor({ [FILE]: "const a = 1;\n" });
    await exec("delete_file", { path: FILE }, "c1");
    expect(seen).toEqual([[{ path: FILE, status: "deleted" }]]);
  });

  it("dit un RENOMMAGE, et d'où le fichier vient", async () => {
    const { exec, seen } = execToolFor({ [FILE]: "const a = 1;\n" });
    await exec("move_file", { from: FILE, to: "b.ts" }, "c1");
    expect(seen).toEqual([[{ path: "b.ts", status: "renamed", previousPath: FILE }]]);
  });

  it("ne dit RIEN d'une édition qui a échoué", async () => {
    // Le fil montrerait un fichier touché que le tour n'a pas touché, et le
    // `files_changed` de fin de tour le démentirait — sans que rien ne l'explique.
    const { exec, seen } = execToolFor({ [FILE]: "const a = 1;\n" });
    const out = await exec(
      "edit_file",
      { path: FILE, old_string: "introuvable", new_string: "x" },
      "c1",
    );
    expect(out.success).toBe(false);
    expect(seen).toEqual([]);
  });

  it("ne dit rien non plus d'une LECTURE", async () => {
    const { exec, seen } = execToolFor({ [FILE]: "const a = 1;\n" });
    await exec("read_file", { path: FILE }, "c1");
    expect(seen).toEqual([]);
  });

  it("annonce tous les fichiers d'un batch, en une fois", async () => {
    const { exec, seen } = execToolFor({ "a.ts": "const a = 1;\n", "b.ts": "const b = 2;\n" });
    await exec(
      "apply_edits",
      {
        changes: [
          { path: "a.ts", op: "update", edits: [{ old_string: "1", new_string: "10" }] },
          { path: "b.ts", op: "update", edits: [{ old_string: "2", new_string: "20" }] },
        ],
      },
      "c1",
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([
      { path: "a.ts", status: "modified" },
      { path: "b.ts", status: "modified" },
    ]);
  });
});
