import { describe, expect, it } from "vitest";
import {
  applyPatchEdits,
  parsePatch,
  usesApplyPatch,
  type PatchEdit,
  type PatchOp,
} from "./patch";

/**
 * MIN-115 : le format `apply_patch` de Codex/OpenCode, servi aux modèles `gpt-*`.
 * Ce module est le SEUL endroit où le format vit — l'application, elle, reste la
 * cascade d'`edit.ts`. Les tests portent donc sur deux choses : ce que le parseur
 * comprend (et ce qu'il refuse, avec un message que le modèle peut corriger), et
 * le fait que la traduction en `{ oldString, newString }` s'applique vraiment.
 */

function envelope(...body: string[]): string {
  return ["*** Begin Patch", ...body, "*** End Patch"].join("\n");
}

/** Les hunks d'une section `update` (les tests n'en construisent pas d'autres). */
function editsOf(op: PatchOp): PatchEdit[] {
  if (op.op !== "update") throw new Error(`expected an update op, got ${op.op}`);
  return op.edits;
}

describe("usesApplyPatch", () => {
  it("sert le format à la famille GPT (la règle d'OpenCode)", () => {
    expect(usesApplyPatch("openai/gpt-5.6-luna")).toBe(true);
    expect(usesApplyPatch("openai/gpt-5")).toBe(true);
    // La règle marche telle quelle sur un id nu (OpenCode) ou préfixé (nous).
    expect(usesApplyPatch("gpt-5.6-luna")).toBe(true);
  });

  it("exclut gpt-4 (génération précédente) et gpt-oss (poids ouverts)", () => {
    expect(usesApplyPatch("openai/gpt-4o")).toBe(false);
    expect(usesApplyPatch("openai/gpt-4.1")).toBe(false);
    expect(usesApplyPatch("openai/gpt-oss-120b")).toBe(false);
  });

  it("laisse tout le reste sur edit_file", () => {
    expect(usesApplyPatch("deepseek/deepseek-v4-flash")).toBe(false);
    expect(usesApplyPatch("anthropic/claude-sonnet-5")).toBe(false);
    expect(usesApplyPatch(null)).toBe(false);
    expect(usesApplyPatch(undefined)).toBe(false);
  });
});

describe("parsePatch — les quatre opérations", () => {
  it("crée un fichier", () => {
    const ops = parsePatch(envelope("*** Add File: hello.txt", "+Hello", "+world"));
    expect(ops).toEqual([{ op: "add", path: "hello.txt", content: "Hello\nworld\n" }]);
  });

  it("garde les lignes vides d'un fichier créé, `+` ou non", () => {
    const ops = parsePatch(envelope("*** Add File: a.ts", "+const a = 1;", "+", "+export {};"));
    expect(ops[0]).toMatchObject({ content: "const a = 1;\n\nexport {};\n" });
    const bare = parsePatch(envelope("*** Add File: a.ts", "+const a = 1;", "", "+export {};"));
    expect(bare[0]).toMatchObject({ content: "const a = 1;\n\nexport {};\n" });
  });

  it("supprime un fichier", () => {
    const ops = parsePatch(envelope("*** Delete File: obsolete.txt"));
    expect(ops).toEqual([{ op: "delete", path: "obsolete.txt" }]);
  });

  it("met à jour un fichier", () => {
    const ops = parsePatch(
      envelope("*** Update File: src/app.py", "@@ def greet():", '-print("Hi")', '+print("Hello")'),
    );
    expect(ops).toEqual([
      {
        op: "update",
        path: "src/app.py",
        edits: [{ oldString: 'print("Hi")', newString: 'print("Hello")', context: "def greet():" }],
      },
    ]);
  });

  it("renomme un fichier (Move to) et porte quand même ses hunks", () => {
    const ops = parsePatch(
      envelope("*** Update File: src/app.py", "*** Move to: src/main.py", "@@", "-old", "+new"),
    );
    expect(ops[0]).toMatchObject({ op: "update", path: "src/app.py", moveTo: "src/main.py" });
    expect(editsOf(ops[0])).toHaveLength(1);
  });

  it("accepte un renommage SEC (Move to sans aucun hunk)", () => {
    const ops = parsePatch(envelope("*** Update File: a.ts", "*** Move to: b.ts"));
    expect(ops[0]).toEqual({ op: "update", path: "a.ts", moveTo: "b.ts", edits: [] });
    // Et le contenu ne bouge pas d'un octet.
    expect(applyPatchEdits("a.ts", "const a = 1;\n", editsOf(ops[0]))).toEqual({
      content: "const a = 1;\n",
      additions: 0,
      deletions: 0,
    });
  });
});

describe("parsePatch — hunks", () => {
  it("porte les lignes de contexte dans les deux versions", () => {
    const ops = parsePatch(
      envelope(
        "*** Update File: a.ts",
        "@@ function foo() {",
        "   const a = 1;",
        "-  return a;",
        "+  return a + 1;",
        " }",
      ),
    );
    const edit = editsOf(ops[0])[0];
    expect(edit.oldString).toBe("  const a = 1;\n  return a;\n}");
    expect(edit.newString).toBe("  const a = 1;\n  return a + 1;\n}");
  });

  it("accepte un hunk sans `@@` (le contexte est optionnel)", () => {
    const ops = parsePatch(envelope("*** Update File: a.ts", "-old", "+new"));
    const edits = editsOf(ops[0]);
    expect(edits).toHaveLength(1);
    expect(edits[0].context).toBeUndefined();
  });

  it("enchaîne plusieurs hunks dans un même fichier", () => {
    const ops = parsePatch(
      envelope("*** Update File: a.ts", "@@ one", "-a", "+A", "@@ two", "-b", "+B"),
    );
    expect(editsOf(ops[0])).toHaveLength(2);
  });

  it("consomme l'ancre `*** End of File` sans avaler la suite du patch", () => {
    const ops = parsePatch(
      envelope(
        "*** Update File: a.ts",
        "@@",
        "-last",
        "+LAST",
        "*** End of File",
        "*** Delete File: b.ts",
      ),
    );
    expect(ops).toHaveLength(2);
    expect(ops[1]).toEqual({ op: "delete", path: "b.ts" });
  });

  it("retire les lignes vides communes en tête et en queue d'un hunk", () => {
    const ops = parsePatch(envelope("*** Update File: a.ts", "@@", "", "-a", "+A", ""));
    const edit = editsOf(ops[0])[0];
    expect(edit.oldString).toBe("a");
    expect(edit.newString).toBe("A");
  });
});

describe("parsePatch — patch multi-fichiers", () => {
  it("lit une enveloppe qui mélange les quatre opérations", () => {
    const ops = parsePatch(
      envelope(
        "*** Add File: hello.txt",
        "+Hello world",
        "*** Update File: src/app.py",
        "*** Move to: src/main.py",
        "@@ def greet():",
        '-print("Hi")',
        '+print("Hello, world!")',
        "*** Delete File: obsolete.txt",
      ),
    );
    expect(ops.map((o) => o.op)).toEqual(["add", "update", "delete"]);
    expect(ops[1]).toMatchObject({ path: "src/app.py", moveTo: "src/main.py" });
  });
});

describe("parsePatch — CRLF et heredoc", () => {
  it("lit un patch en CRLF", () => {
    const text = envelope("*** Update File: a.ts", "@@", "-old", "+new").replaceAll("\n", "\r\n");
    expect(parsePatch(text)).toEqual([
      { op: "update", path: "a.ts", edits: [{ oldString: "old", newString: "new" }] },
    ]);
  });

  it("déballe un patch enveloppé dans un heredoc shell", () => {
    const text = `cat <<'EOF'\n${envelope("*** Delete File: a.ts")}\nEOF`;
    expect(parsePatch(text)).toEqual([{ op: "delete", path: "a.ts" }]);
  });
});

describe("parsePatch — malformés", () => {
  it("refuse une enveloppe sans en-tête", () => {
    expect(() => parsePatch("*** Update File: a.ts\n-old\n+new")).toThrow(/Begin Patch/);
  });

  it("refuse une enveloppe jamais fermée", () => {
    expect(() => parsePatch("*** Begin Patch\n*** Delete File: a.ts")).toThrow(/End Patch/);
  });

  it("refuse une enveloppe vide", () => {
    expect(() => parsePatch(envelope())).toThrow(/empty/);
  });

  it("refuse un hunk qui ne suit aucun en-tête de fichier", () => {
    expect(() => parsePatch(envelope("@@ def greet():", "-a", "+b"))).toThrow(
      /outside any file section/,
    );
  });

  it("refuse une directive inconnue", () => {
    expect(() => parsePatch(envelope("*** Rename File: a.ts"))).toThrow(/unknown directive/);
  });

  it("refuse un en-tête sans chemin", () => {
    expect(() => parsePatch(envelope("*** Delete File:"))).toThrow(/no file path/);
  });

  it("refuse une section Update sans hunk", () => {
    expect(() => parsePatch(envelope("*** Update File: a.ts", "*** Delete File: b.ts"))).toThrow(
      /carries no hunk/,
    );
  });

  it("refuse un hunk qui ne change rien", () => {
    expect(() => parsePatch(envelope("*** Update File: a.ts", "@@ foo", " unchanged"))).toThrow(
      /changes nothing/,
    );
    expect(() => parsePatch(envelope("*** Update File: a.ts", "@@ foo", "-a", "+a"))).toThrow(
      /changes nothing/,
    );
  });

  it("refuse une ligne de hunk sans marqueur", () => {
    expect(() => parsePatch(envelope("*** Update File: a.ts", "@@", "-a", "+b", "oops"))).toThrow(
      /must start with/,
    );
  });

  it("refuse une ligne non préfixée dans un fichier créé", () => {
    expect(() => parsePatch(envelope("*** Add File: a.ts", "Hello"))).toThrow(/must start with '\+'/);
  });
});

describe("applyPatchEdits — la cascade d'edit.ts, pas un second applicateur", () => {
  it("applique un hunk avec son contexte", () => {
    const original = "function foo() {\n  const a = 1;\n  return a;\n}\n";
    const ops = parsePatch(
      envelope("*** Update File: a.ts", "@@ function foo() {", "-  return a;", "+  return a + 1;"),
    );
    const r = applyPatchEdits("a.ts", original, editsOf(ops[0]));
    expect(r.content).toBe("function foo() {\n  const a = 1;\n  return a + 1;\n}\n");
    expect(r).toMatchObject({ additions: 1, deletions: 1 });
  });

  it("applique plusieurs hunks du même fichier, dans l'ordre", () => {
    const original = "a\nb\nc\n";
    const ops = parsePatch(
      envelope("*** Update File: f.txt", "@@", "-a", "+A", "@@", "-c", "+C"),
    );
    const r = applyPatchEdits("f.txt", original, editsOf(ops[0]));
    expect(r.content).toBe("A\nb\nC\n");
  });

  it("l'ancre `@@` lève l'ambiguïté d'un bloc présent deux fois", () => {
    const original = [
      "function a() {",
      "  return 1;",
      "}",
      "function b() {",
      "  return 1;",
      "}",
      "",
    ].join("\n");
    const ops = parsePatch(
      envelope("*** Update File: f.ts", "@@ function b() {", "-  return 1;", "+  return 2;"),
    );
    const r = applyPatchEdits("f.ts", original, editsOf(ops[0]));
    expect(r.content).toBe(
      ["function a() {", "  return 1;", "}", "function b() {", "  return 2;", "}", ""].join("\n"),
    );
  });

  it("une ancre qui n'aide pas reste un indice : on retente sur le fichier entier", () => {
    const original = "const a = 1;\nconst b = 2;\n";
    const ops = parsePatch(
      envelope("*** Update File: f.ts", "@@ function nowhere() {", "-const b = 2;", "+const b = 3;"),
    );
    const r = applyPatchEdits("f.ts", original, editsOf(ops[0]));
    expect(r.content).toBe("const a = 1;\nconst b = 3;\n");
  });

  it("insère un hunk sans ligne supprimée après son ancre", () => {
    const original = "import a from 'a';\n\nexport const x = 1;\n";
    const ops = parsePatch(
      envelope("*** Update File: f.ts", "@@ import a from 'a';", "+import b from 'b';"),
    );
    const r = applyPatchEdits("f.ts", original, editsOf(ops[0]));
    expect(r.content).toBe("import a from 'a';\nimport b from 'b';\n\nexport const x = 1;\n");
    expect(r).toMatchObject({ additions: 1, deletions: 0 });
  });

  it("insère en fin de fichier quand le hunk n'a pas d'ancre", () => {
    const ops = parsePatch(envelope("*** Update File: f.ts", "+export const y = 2;"));
    const r = applyPatchEdits("f.ts", "export const x = 1;\n", editsOf(ops[0]));
    expect(r.content).toBe("export const x = 1;\nexport const y = 2;\n");
  });

  it("préserve les CRLF du fichier d'origine", () => {
    const ops = parsePatch(envelope("*** Update File: f.ts", "@@", "-const a = 1;", "+const a = 2;"));
    const r = applyPatchEdits("f.ts", "const a = 1;\r\nconst b = 3;\r\n", editsOf(ops[0]));
    expect(r.content).toBe("const a = 2;\r\nconst b = 3;\r\n");
  });

  it("lève, sans rien écrire, quand le hunk ne s'applique pas", () => {
    const ops = parsePatch(envelope("*** Update File: f.ts", "@@", "-absent", "+present"));
    expect(() => applyPatchEdits("f.ts", "const a = 1;\n", editsOf(ops[0]))).toThrow(
      /Could not find/,
    );
  });
});
