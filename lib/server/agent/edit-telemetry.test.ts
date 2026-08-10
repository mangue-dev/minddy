import { describe, expect, it } from "vitest";

import { makeExecTool } from "./exec-tool";
import { REPO_DIR, type RepoHost } from "./repo-host";

/**
 * MIN-246 — ce que les trois chemins d'édition RENDENT, des deux côtés.
 *
 * Au modèle : un diff. Jusqu'ici seul `edit_file` en rendait un ; `apply_edits`
 * et `apply_patch` — le batch, et la totalité des runs `gpt-*` — ne rendaient
 * qu'`additions`/`deletions`, donc le modèle éditait à l'aveugle là où il édite
 * le plus.
 *
 * À la mesure : la télémétrie de la cascade, qui voyage À CÔTÉ du résultat (le
 * modèle ne la voit jamais) et que la boucle recopie dans l'event `tool_result`.
 */

function fakeHost(files: Record<string, string>): RepoHost & { files: Map<string, string> } {
  const map = new Map(Object.entries(files).map(([p, c]) => [`${REPO_DIR}/${p}`, c]));
  return {
    files: map,
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: async (abs) => map.get(abs) ?? null,
    writeFile: async (abs, content) => {
      map.set(abs, content);
    },
    mkdir: async () => {},
  };
}

function execToolFor(host: RepoHost) {
  return makeExecTool({
    host,
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
  });
}

const FILE = "a.ts";
const ORIGINAL = "const a = 1;\nconst b = 2;\nconst c = 3;\n";

function appliedOf(result: unknown): Array<Record<string, unknown>> {
  const applied = (result as { applied?: unknown }).applied;
  return Array.isArray(applied) ? (applied as Array<Record<string, unknown>>) : [];
}

/** Enveloppe `apply_patch` (mêmes marqueurs que `patch.ts`). */
function envelope(...lines: string[]): string {
  return ["*** Begin Patch", ...lines, "*** End Patch"].join("\n");
}

describe("edit_file — la trace remonte", () => {
  it("mesure le replacer qui a résolu, sans rien changer à ce que le modèle lit", async () => {
    const out = await execToolFor(fakeHost({ [FILE]: ORIGINAL }))("edit_file", {
      path: FILE,
      old_string: "const b = 2;",
      new_string: "const b = 20;",
    });

    expect(out.success).toBe(true);
    expect(String((out.result as { diff: string }).diff)).toMatch(/\+const b = 20;/);
    expect(out.edit).toMatchObject({
      tool: "edit_file",
      matched: [{ replacer: "simple", rank: 1 }],
      failed: [],
    });
  });

  it("compte un refus de la cascade par son motif", async () => {
    const out = await execToolFor(fakeHost({ [FILE]: ORIGINAL }))("edit_file", {
      path: FILE,
      old_string: "absent du fichier",
      new_string: "peu importe",
    });

    expect(out.success).toBe(false);
    expect(out.edit).toMatchObject({ tool: "edit_file", failed: [{ reason: "not_found" }] });
  });
});

describe("apply_edits — le batch rend enfin un diff", () => {
  it("rend le diff du fichier une fois TOUS ses edits posés", async () => {
    const host = fakeHost({ [FILE]: ORIGINAL, "b.ts": "let x = 0;\n" });
    const out = await execToolFor(host)("apply_edits", {
      changes: [
        {
          path: FILE,
          op: "update",
          edits: [
            { old_string: "const a = 1;", new_string: "const a = 10;" },
            { old_string: "const c = 3;", new_string: "const c = 30;" },
          ],
        },
        { path: "b.ts", op: "update", edits: [{ old_string: "let x = 0;", new_string: "let x = 1;" }] },
      ],
    });

    expect(out.success).toBe(true);
    const [first, second] = appliedOf(out.result);
    // UN diff par fichier, portant les deux substitutions du premier.
    expect(String(first.diff)).toMatch(/\+const a = 10;/);
    expect(String(first.diff)).toMatch(/\+const c = 30;/);
    expect(String(second.diff)).toMatch(/\+let x = 1;/);
    // Et les compteurs d'avant restent là.
    expect(first).toMatchObject({ ok: true, additions: 2, deletions: 2 });

    expect(out.edit).toMatchObject({ tool: "apply_edits", failed: [] });
    expect(out.edit?.matched).toHaveLength(3); // trois substitutions, trois traces
  });

  it("ne rend aucun diff pour une création ou une suppression", async () => {
    const host = fakeHost({ [FILE]: ORIGINAL });
    const out = await execToolFor(host)("apply_edits", {
      changes: [
        { path: "new.ts", op: "add", content: "export const n = 1;\n" },
        { path: FILE, op: "delete" },
      ],
    });

    expect(out.success).toBe(true);
    for (const entry of appliedOf(out.result)) expect(entry.diff).toBeUndefined();
    // Rien n'est passé par la cascade : pas de télémétrie à porter.
    expect(out.edit).toBeUndefined();
  });

  it("compte le refus de chaque edit, y compris le no-op sauté", async () => {
    const out = await execToolFor(fakeHost({ [FILE]: ORIGINAL }))("apply_edits", {
      changes: [
        {
          path: FILE,
          op: "update",
          edits: [
            { old_string: "const a = 1;", new_string: "const a = 10;" },
            { old_string: "const b = 2;", new_string: "const b = 2;" },
          ],
        },
      ],
    });

    expect(out.success).toBe(true);
    expect(out.edit?.matched).toHaveLength(1);
    expect(out.edit?.failed).toEqual([{ reason: "identical", candidates: 0 }]);
  });
});

describe("apply_patch — le chemin de tous les runs gpt-*", () => {
  it("rend un diff et mesure la tentative d'ancrage qui a passé", async () => {
    const host = fakeHost({ [FILE]: ORIGINAL });
    const out = await execToolFor(host)("apply_patch", {
      patch: envelope(
        `*** Update File: ${FILE}`,
        "@@ const b = 2;",
        "-const b = 2;",
        "+const b = 20;",
      ),
    });

    expect(out.success).toBe(true);
    const [entry] = appliedOf(out.result);
    expect(String(entry.diff)).toMatch(/\+const b = 20;/);
    expect(host.files.get(`${REPO_DIR}/${FILE}`)).toContain("const b = 20;");

    expect(out.edit?.tool).toBe("apply_patch");
    expect(out.edit?.matched[0]).toMatchObject({ replacer: "simple", attempt: 1 });
  });

  it("compte une enveloppe illisible comme une rupture de FORMAT", async () => {
    const out = await execToolFor(fakeHost({ [FILE]: ORIGINAL }))("apply_patch", {
      patch: "-const b = 2;\n+const b = 20;\n", // ni Begin ni End Patch
    });

    expect(out.success).toBe(false);
    expect(out.edit?.tool).toBe("apply_patch");
    expect(out.edit?.parse_error).toBeTruthy();
    expect(out.edit?.matched).toEqual([]);
  });
});
