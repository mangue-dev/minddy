import { describe, expect, it } from "vitest";
import {
  applyEdit,
  diffFiles,
  replace,
  replaceTraced,
  ReplaceError,
  sealTelemetry,
  telemetryFailure,
  telemetryMatch,
  trimDiff,
} from "./edit";

/**
 * Tests of the editing engine (cascade of opencode scoped replacers). We check
 * especially the TOLERANCE (the model derives from a space / an indentation) AND the
 * safety (noisy failure: never silent corruption).
 */

describe("replace — matching exact", () => {
  it("remplace une occurrence unique", () => {
    expect(replace("const a = 1;\nconst b = 2;\n", "const a = 1;", "const a = 10;")).toBe(
      "const a = 10;\nconst b = 2;\n",
    );
  });

  it("remplace au milieu d'une ligne", () => {
    expect(replace("foo(bar, baz)", "bar", "qux")).toBe("foo(qux, baz)");
  });
});

describe("replace — tolérance", () => {
  it("matche malgré une indentation différente (LineTrimmed/IndentationFlexible)", () => {
    const content = "function f() {\n    return 1;\n}\n";
    // The model forgot the exact indentation of the internal line.
    const out = replace(content, "return 1;", "return 2;");
    expect(out).toBe("function f() {\n    return 2;\n}\n");
  });

  it("matche un bloc multi-lignes dont l'indentation globale diffère", () => {
    const content = ["class C {", "  method() {", "    doThing();", "  }", "}"].join("\n");
    const old = ["method() {", "  doThing();", "}"].join("\n"); // unindented
    const out = replace(content, old, ["method() {", "  doOther();", "}"].join("\n"));
    expect(out).toContain("doOther();");
    expect(out).not.toContain("doThing();");
  });

  it("matche via ancres début/fin quand le milieu a légèrement dérivé (BlockAnchor)", () => {
    const content = ["if (x) {", "  const y = compute(x);", "  return y;", "}"].join("\n");
    // Milieu approximatif mais ancres exactes.
    const old = ["if (x) {", "  const y = compute( x );", "  return y;", "}"].join("\n");
    const out = replace(content, old, ["if (x) {", "  return 0;", "}"].join("\n"));
    expect(out).toBe(["if (x) {", "  return 0;", "}"].join("\n"));
  });
});

describe("replace — pas de ligne vide parasite (frontière \\n)", () => {
  it("n'insère pas de ligne vide quand un replacer tolérant matche et que old/new finissent par \\n", () => {
    // Line 1 with trailing spaces (whitespace drift) → SimpleReplacer fails,
    // LineTrimmedReplacer match (span without the final \n).
    const original = "  const a = 1;  \n  const b = 2;\n  return a + b;\n";
    const oldStr = "  const a = 1;\n  const b = 2;\n"; // finit par \n
    const newStr = "  const a = 1;\n  const b = 3;\n"; // finit par \n
    const out = replace(original, oldStr, newStr);
    expect(out).toBe("  const a = 1;\n  const b = 3;\n  return a + b;\n");
    expect(out).not.toContain("\n\n"); // no empty lines inserted
  });

  it("ne fusionne pas les lignes quand new_string ne finit pas par \\n", () => {
    const original = "  const a = 1;  \n  const b = 2;\n  return a + b;\n";
    // new_string without final \n → old (correct) behavior should be preserved.
    const out = replace(original, "  const a = 1;\n  const b = 2;", "  const a = 1;\n  const b = 3;");
    expect(out).toBe("  const a = 1;\n  const b = 3;\n  return a + b;\n");
  });

  it("applyEdit ne gonfle pas le diff (pas de ligne vide) sur ce cas", () => {
    const original = "  const a = 1;  \n  const b = 2;\n  return a + b;\n";
    const res = applyEdit("f.ts", original, "  const a = 1;\n  const b = 2;\n", "  const a = 1;\n  const b = 3;\n");
    expect(res.content).toBe("  const a = 1;\n  const b = 3;\n  return a + b;\n");
    // The whitespace drift also normalizes line 1 (2 lines changed), but
    // NO empty lines are added → the bug increased to additions=3.
    expect(res.additions).toBe(2);
    expect(res.deletions).toBe(2);
  });
});

describe("replace — normalisation unicode", () => {
  it("matche malgré em-dash / quotes courbes là où le fichier est ASCII", () => {
    const original = 'const label = "hello - world";\n';
    // old_string with curved quotes + em-dash (typographical drift of the template).
    const oldStr = 'const label = “hello — world”;';
    const out = replace(original, oldStr, 'const label = "bye";');
    expect(out).toBe('const label = "bye";\n');
  });
});

describe("replace — replaceAll", () => {
  it("remplace toutes les occurrences", () => {
    expect(replace("a a a", "a", "b", true)).toBe("b b b");
  });

  it("refuse une occurrence ambiguë sans replaceAll", () => {
    expect(() => replace("a a a", "a", "b")).toThrow(/multiple matches/i);
  });

  it("ne double pas le \\n de frontière sur un match tolérant (régression)", () => {
    // Two identically indented blocks; old_string de-indented → LineTrimmed match
    // and yield a span without the final \n. new_string ends with \n.
    const original = "if (x) {\n  do()\n}\nif (x) {\n  do()\n}\n";
    const out = replace(original, "if (x) {\ndo()\n}", "if (y) {\n  do()\n}\n", true);
    expect(out).toBe("if (y) {\n  do()\n}\nif (y) {\n  do()\n}\n");
    expect(out).not.toContain("}\n\n"); // no extraneous empty lines
  });
});

describe("replace — échecs bruyants", () => {
  it("lève si old_string introuvable", () => {
    expect(() => replace("hello world", "goodbye", "x")).toThrow(/could not find/i);
  });

  it("lève si old_string === new_string", () => {
    expect(() => replace("x", "x", "x")).toThrow(/identical/i);
  });

  it("lève si old_string vide", () => {
    expect(() => replace("x", "", "y")).toThrow(/cannot be empty/i);
  });

  it("refuse un match disproportionné", () => {
    // A one-line `find` which, via a tolerant replacer, would match a huge block.
    const content = "x\n" + Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    // Impossible here to make a real over-match trivially; we check at
    // unless the exact one works and doesn't trigger the guard.
    expect(replace(content, "line 0", "LINE 0")).toContain("LINE 0");
  });
});

describe("applyEdit — diff & comptage", () => {
  it("renvoie le contenu, un diff et des compteurs cohérents", () => {
    const original = "const a = 1;\nconst b = 2;\nconst c = 3;\n";
    const res = applyEdit("f.ts", original, "const b = 2;", "const b = 20;\nconst b2 = 21;");
    expect(res.content).toContain("const b = 20;");
    expect(res.content).toContain("const b2 = 21;");
    expect(res.additions).toBeGreaterThan(0);
    expect(res.deletions).toBeGreaterThan(0);
    expect(res.diff).toMatch(/-const b = 2;/);
    expect(res.diff).toMatch(/\+const b = 20;/);
  });

  it("préserve les fins de ligne CRLF du fichier d'origine", () => {
    const original = "a\r\nb\r\nc\r\n";
    const res = applyEdit("f.ts", original, "b", "B");
    expect(res.content).toBe("a\r\nB\r\nc\r\n");
  });
});

/**
 * MIN-246 — the waterfall is MEASURED. These tests do not defend a threshold (no
 * arbitration is taken here): they defend the fact that the reading tells the truth.
 */
describe("replaceTraced — la trace de la cascade", () => {
  it("nomme le replacer et son rang sur un match exact", () => {
    const { trace } = replaceTraced("const a = 1;\n", "const a = 1;", "const a = 2;");
    expect(trace.replacer).toBe("simple");
    expect(trace.rank).toBe(1);
    expect(trace.candidates).toBe(1);
    expect(trace.similarity).toBeUndefined(); // an exact does not calculate any similarity
  });

  it("rend la similarité du bloc quand c'est l'ancrage qui résout", () => {
    const content = ["function f() {", "  const total = items.length;", "  return total;", "}", ""].join("\n");
    // The model copied the middle line incorrectly: only BlockAnchorReplacer (rank 3)
    // can still anchor the block on its first and last lines.
    const find = ["function f() {", "  const total = item.length;", "  return total;", "}"].join("\n");
    const { content: out, trace } = replaceTraced(content, find, "function f() {\n  return 0;\n}");
    expect(out).toContain("return 0;");
    expect(trace.replacer).toBe("block_anchor");
    expect(trace.rank).toBe(3);
    expect(trace.similarity).toBeGreaterThan(0.65);
    expect(trace.similarity).toBeLessThan(1);
  });

  it("porte la trace sur l'échec, avec ce que la cascade avait vu", () => {
    try {
      replace("hello world", "goodbye", "x");
      expect.unreachable("replace aurait dû lever");
    } catch (err) {
      expect(err).toBeInstanceOf(ReplaceError);
      const e = err as ReplaceError;
      expect(e.reason).toBe("not_found");
      expect(e.trace.candidates).toBe(0);
    }
  });
});

describe("replace — un span disproportionné n'emporte plus la cascade (MIN-246)", () => {
  /**
 * Two identical blocks down to the last detail: the first is buried under 600 spaces
 * of indentation (tolerant replacers find it, but its extent is without
 * in common with `old_string`), the second differs only by a hyphen
 * typographical — it is the that the model is aiming for, and only the unicode replacer
 * (rank 6) knows how to see it.
 *
 * Before the fix, the first candidate RISED from inside the double
 * loop: the edit failed and the round was burned.
 */
  const pad = " ".repeat(600);
  const find = ['if (x) {', '  send("a-b");', "}"].join("\n");
  const wide = [`${pad}if (x) {`, `${pad}  send("a-b");`, `${pad}}`].join("\n");
  const target = ['if (x) {', '  send("a—b");', "}"].join("\n");
  const content = `${wide}\n\nconst z = 0;\n\n${target}\n`;

  it("écarte le candidat trop large et laisse un replacer plus bas résoudre", () => {
    const { content: out, trace } = replaceTraced(content, find, 'if (x) {\n  send("ok");\n}');
    expect(out).toContain('send("ok");');
    expect(out).toContain(pad); // the block too large was not touched
    expect(trace.replacer).toBe("unicode_normalized");
    expect(trace.rank).toBe(6);
    expect(trace.rejectedDisproportionate).toBeGreaterThan(0);
  });

  it("garde le refus bruyant quand AUCUN candidat ne convient", () => {
    // The same block too large, alone in the file: nothing more to resolve below.
    try {
      replace(`${wide}\n`, find, 'if (x) {\n  send("ok");\n}');
      expect.unreachable("replace aurait dû lever");
    } catch (err) {
      expect(err).toBeInstanceOf(ReplaceError);
      expect((err as ReplaceError).reason).toBe("disproportionate");
      expect((err as ReplaceError).trace.rejectedDisproportionate).toBeGreaterThan(0);
    }
  });
});

describe("télémétrie d'édition", () => {
  it("aplatit une trace en entrée de relevé, similarité arrondie", () => {
    const m = telemetryMatch({
      replacer: "block_anchor",
      rank: 3,
      similarity: 0.812345,
      candidates: 2,
      rejectedDisproportionate: 1,
      rejectedAmbiguous: 0,
      attempt: 2,
    });
    expect(m).toEqual({
      replacer: "block_anchor",
      rank: 3,
      similarity: 0.812,
      attempt: 2,
      rejected_disproportionate: 1,
    });
  });

  it("compte un refus de la cascade par son motif, et le reste à part", () => {
    const cascade = telemetryFailure(new ReplaceError("not_found", "nope", {
      candidates: 4,
      rejectedDisproportionate: 2,
      rejectedAmbiguous: 1,
    }));
    expect(cascade).toEqual({ reason: "not_found", candidates: 4, rejected_disproportionate: 2 });
    expect(telemetryFailure(new Error("File not found"))).toEqual({ reason: "other", candidates: 0 });
  });

  it("ne rend rien quand il n'y a rien à mesurer, et dit ce qu'elle a capé", () => {
    expect(sealTelemetry({ tool: "apply_edits", matched: [], failed: [] })).toBeUndefined();
    const many = Array.from({ length: 25 }, () => ({ replacer: "simple", rank: 1 }));
    const sealed = sealTelemetry({ tool: "apply_edits", matched: many, failed: [] });
    expect(sealed?.matched).toHaveLength(20);
    expect(sealed?.matched_total).toBe(25);
    expect(sealed?.failed_total).toBeUndefined();
  });
});

describe("diffFiles", () => {
  it("rend le même diff qu'applyEdit pour un même couple avant/après", () => {
    const before = "const a = 1;\nconst b = 2;\n";
    const res = applyEdit("f.ts", before, "const b = 2;", "const b = 3;");
    expect(diffFiles("f.ts", before, res.content)).toBe(res.diff);
  });

  it("rend un diff vide quand rien n'a changé", () => {
    expect(diffFiles("f.ts", "a\n", "a\n")).not.toMatch(/^[-+][^-+]/m);
  });
});

describe("trimDiff", () => {
  it("retire l'indentation commune des lignes de contenu", () => {
    const diff = [
      "--- a",
      "+++ b",
      "@@ -1,2 +1,2 @@",
      "     const x = 1;",
      "-    const y = 2;",
      "+    const y = 3;",
    ].join("\n");
    const out = trimDiff(diff);
    // The +/-/space prefixes remain, but the common indentation (4) is removed.
    expect(out).toContain("-const y = 2;");
    expect(out).toContain("+const y = 3;");
    expect(out).toContain(" const x = 1;");
    // Headers intact.
    expect(out).toContain("--- a");
    expect(out).toContain("+++ b");
  });
});
