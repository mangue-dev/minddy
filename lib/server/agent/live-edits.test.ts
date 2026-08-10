import { describe, expect, it, vi } from "vitest";

import { makeExecTool, type AgentLiveEdit } from "./exec-tool";
import { liveEditHook, newLiveEditLog } from "./live-edits";
import { CHANGED_FILES_CAP, REPO_DIR, type RepoHost } from "./repo-host";

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
    projectPrTool: null,
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

/**
 * Le REGISTRE, celui que la fonction et la microVM tiennent tous les deux. Ce que
 * ces cas gardent, c'est la règle qui a coûté le plus cher à trouver : la liste
 * part avec CHAQUE charge, parce qu'une charge est un instantané complet et que le
 * fil efface ce qu'elle tait.
 */
describe("newLiveEditLog", () => {
  it("ne dit RIEN tant que rien n'a été touché — pas même une liste vide", () => {
    // Une clé `files: []` en trop suffirait à faire passer un round au repos pour
    // un signe de vie : le fil ne saurait plus quand effacer la queue vivante.
    expect(newLiveEditLog().payload()).toEqual({});
  });

  it("rend la liste ENTIÈRE à chaque charge, pas seulement à celle de l'édition", () => {
    const log = newLiveEditLog();
    log.note([{ path: "a.ts", status: "modified" }]);
    log.note([{ path: "b.ts", status: "added" }]);
    expect(log.payload()).toEqual(log.payload());
    expect(log.payload().files?.map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("une entrée par chemin, et la dernière nouvelle l'emporte", () => {
    const log = newLiveEditLog();
    log.note([{ path: "a.ts", status: "modified" }]);
    log.note([{ path: "a.ts", status: "deleted" }]);
    expect(log.payload().files).toEqual([{ path: "a.ts", status: "deleted" }]);
  });

  it("borne la liste et le DIT", () => {
    const log = newLiveEditLog();
    log.note(
      Array.from({ length: CHANGED_FILES_CAP + 5 }, (_, i) => ({
        path: `f${i}.ts`,
        status: "modified" as const,
      })),
    );
    expect(log.payload().files).toHaveLength(CHANGED_FILES_CAP);
    expect(log.payload().filesTruncated).toBe(true);
  });

  it("`clear` ne rend `true` qu'une fois : rien à rediffuser sur un registre vide", () => {
    const log = newLiveEditLog();
    expect(log.clear()).toBe(false);
    log.note([{ path: "a.ts", status: "modified" }]);
    expect(log.clear()).toBe(true);
    expect(log.clear()).toBe(false);
    expect(log.payload()).toEqual({});
  });
});

describe("liveEditHook", () => {
  it("rediffuse AUSSITÔT, sur une charge de round au repos", () => {
    // Sans la rediffusion, le fil attendrait la prochaine charge de texte — donc le
    // prochain round. Et `tools: 1` mentirait : le fil s'en sert pour décider si un
    // texte est la réponse du tour ou de la narration.
    const log = newLiveEditLog();
    const emitLive = vi.fn();
    liveEditHook(log, emitLive)([{ path: "a.ts", status: "modified" }]);
    expect(emitLive).toHaveBeenCalledWith({
      text: "",
      tools: 0,
      reasoningActive: false,
      reasoningMs: 0,
    });
    expect(log.payload().files).toEqual([{ path: "a.ts", status: "modified" }]);
  });
});
