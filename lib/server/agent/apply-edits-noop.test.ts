import { describe, expect, it } from "vitest";

import { makeExecTool } from "./exec-tool";
import { REPO_DIR, type RepoHost } from "./repo-host";

/**
 * `apply_edits` — un edit qui ne change RIEN ne doit pas emporter les autres.
 *
 * Mesuré sur `agent_run_events` : 8 refus « No changes to apply: oldString and
 * newString are identical », dont 3 batches où le no-op a jeté des edits
 * parfaitement bons du même fichier. Un edit dont l'ancien texte vaut le nouveau
 * ne peut corrompre aucun fichier — l'atomicité par fichier n'a rien à protéger
 * contre lui. Elle reste entière pour tous les autres échecs.
 */

/** Dépôt en mémoire : les tools d'édition ne touchent que `readFile`/`writeFile`. */
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

/** Le tableau `applied` du résultat, quel que soit l'habillage. */
function appliedOf(result: unknown): Array<Record<string, unknown>> {
  const applied = (result as { applied?: unknown }).applied;
  return Array.isArray(applied) ? (applied as Array<Record<string, unknown>>) : [];
}

describe("apply_edits — un no-op ne fait plus tomber le fichier", () => {
  it("applique les edits valides et signale celui qui ne changeait rien", async () => {
    const host = fakeHost({ [FILE]: ORIGINAL });
    const exec = execToolFor(host);

    const out = await exec("apply_edits", {
      changes: [
        {
          path: FILE,
          op: "update",
          edits: [
            { old_string: "const a = 1;", new_string: "const a = 10;" },
            { old_string: "const b = 2;", new_string: "const b = 2;" }, // no-op
            { old_string: "const c = 3;", new_string: "const c = 30;" },
          ],
        },
      ],
    });

    expect(out.success).toBe(true);
    const [entry] = appliedOf(out.result);
    expect(entry).toMatchObject({ path: FILE, ok: true, skipped_edits: [2] });
    // Le no-op est DIT : sans ça le modèle croirait son edit passé.
    expect(String(entry.note)).toMatch(/identical/);
    expect(host.files.get(`${REPO_DIR}/${FILE}`)).toBe(
      "const a = 10;\nconst b = 2;\nconst c = 30;\n",
    );
  });

  it("échoue quand TOUS les edits du fichier ne changent rien", async () => {
    const host = fakeHost({ [FILE]: ORIGINAL });
    const out = await execToolFor(host)("apply_edits", {
      changes: [
        {
          path: FILE,
          op: "update",
          edits: [{ old_string: "const a = 1;", new_string: "const a = 1;" }],
        },
      ],
    });

    expect(out.success).toBe(false);
    expect(String(appliedOf(out.result)[0].error)).toMatch(/every edit has an identical/);
    expect(host.files.get(`${REPO_DIR}/${FILE}`)).toBe(ORIGINAL);
  });

  it("garde l'atomicité du fichier sur un VRAI échec", async () => {
    const host = fakeHost({ [FILE]: ORIGINAL });
    const out = await execToolFor(host)("apply_edits", {
      changes: [
        {
          path: FILE,
          op: "update",
          edits: [
            { old_string: "const a = 1;", new_string: "const a = 10;" },
            { old_string: "absent du fichier", new_string: "peu importe" },
          ],
        },
      ],
    });

    expect(out.success).toBe(false);
    expect(String(appliedOf(out.result)[0].error)).toMatch(/Could not find/);
    // Rien d'écrit : un fichier à moitié édité est pire qu'un échec.
    expect(host.files.get(`${REPO_DIR}/${FILE}`)).toBe(ORIGINAL);
  });

  it("refuse une mise à jour SANS edit au lieu de réécrire le fichier tel quel", async () => {
    const host = fakeHost({ [FILE]: ORIGINAL });
    const out = await execToolFor(host)("apply_edits", {
      changes: [{ path: FILE, op: "update", edits: [] }],
    });

    expect(out.success).toBe(false);
    expect(String(appliedOf(out.result)[0].error)).toMatch(/No edits provided/);
  });

  it("un autre fichier du même batch passe quand même", async () => {
    const host = fakeHost({ [FILE]: ORIGINAL, "b.ts": "let x = 0;\n" });
    const out = await execToolFor(host)("apply_edits", {
      changes: [
        {
          path: FILE,
          op: "update",
          edits: [{ old_string: "const a = 1;", new_string: "const a = 1;" }],
        },
        {
          path: "b.ts",
          op: "update",
          edits: [{ old_string: "let x = 0;", new_string: "let x = 1;" }],
        },
      ],
    });

    expect(out.success).toBe(true); // « au moins un changement est passé »
    expect(appliedOf(out.result).map((a) => a.ok)).toEqual([false, true]);
    expect(host.files.get(`${REPO_DIR}/b.ts`)).toBe("let x = 1;\n");
  });
});
