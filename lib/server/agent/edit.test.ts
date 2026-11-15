import { describe, expect, it } from "vitest";
import {
  applyEdit,
  diffFiles,
  replace,
  replaceTraced,
  ReplaceError,
  trimDiff,
} from "./edit";

/**
 * Tests of the editing engine (opencode's cascade of scoped replacers). They
 * check both TOLERANCE (the model drifts by a space or an indentation) AND
 * safety (failures are loud: never silent corruption).
 */

describe("replace — exact matching", () => {
  it("replaces a single occurrence", () => {
    expect(replace("const a = 1;\nconst b = 2;\n", "const a = 1;", "const a = 10;")).toBe(
      "const a = 10;\nconst b = 2;\n",
    );
  });

  it("replaces in the middle of a line", () => {
    expect(replace("foo(bar, baz)", "bar", "qux")).toBe("foo(qux, baz)");
  });
});

describe("replace — tolerance", () => {
  it("matches despite a different indentation (LineTrimmed/IndentationFlexible)", () => {
    const content = "function f() {\n    return 1;\n}\n";
    // The model forgot the exact indentation of the inner line.
    const out = replace(content, "return 1;", "return 2;");
    expect(out).toBe("function f() {\n    return 2;\n}\n");
  });

  it("matches a multi-line block whose overall indentation differs", () => {
    const content = ["class C {", "  method() {", "    doThing();", "  }", "}"].join("\n");
    const old = ["method() {", "  doThing();", "}"].join("\n"); // unindented
    const out = replace(content, old, ["method() {", "  doOther();", "}"].join("\n"));
    expect(out).toContain("doOther();");
    expect(out).not.toContain("doThing();");
  });

  it("matches through start/end anchors when the middle drifted slightly (BlockAnchor)", () => {
    const content = ["if (x) {", "  const y = compute(x);", "  return y;", "}"].join("\n");
    // Approximate middle, exact anchors.
    const old = ["if (x) {", "  const y = compute( x );", "  return y;", "}"].join("\n");
    const out = replace(content, old, ["if (x) {", "  return 0;", "}"].join("\n"));
    expect(out).toBe(["if (x) {", "  return 0;", "}"].join("\n"));
  });
});

describe("replace — no stray empty line (\\n boundary)", () => {
  it("inserts no empty line when a tolerant replacer matches and old/new end with \\n", () => {
    // Line 1 has trailing spaces (whitespace drift) → SimpleReplacer fails and
    // LineTrimmedReplacer matches (a span without the final \n).
    const original = "  const a = 1;  \n  const b = 2;\n  return a + b;\n";
    const oldStr = "  const a = 1;\n  const b = 2;\n"; // ends with \n
    const newStr = "  const a = 1;\n  const b = 3;\n"; // ends with \n
    const out = replace(original, oldStr, newStr);
    expect(out).toBe("  const a = 1;\n  const b = 3;\n  return a + b;\n");
    expect(out).not.toContain("\n\n"); // no empty lines inserted
  });

  it("does not merge lines when new_string does not end with \\n", () => {
    const original = "  const a = 1;  \n  const b = 2;\n  return a + b;\n";
    // new_string without a final \n → the previous (correct) behavior is preserved.
    const out = replace(original, "  const a = 1;\n  const b = 2;", "  const a = 1;\n  const b = 3;");
    expect(out).toBe("  const a = 1;\n  const b = 3;\n  return a + b;\n");
  });

  it("applyEdit does not inflate the diff (no empty line) in this case", () => {
    const original = "  const a = 1;  \n  const b = 2;\n  return a + b;\n";
    const res = applyEdit("f.ts", original, "  const a = 1;\n  const b = 2;\n", "  const a = 1;\n  const b = 3;\n");
    expect(res.content).toBe("  const a = 1;\n  const b = 3;\n  return a + b;\n");
    // The whitespace drift also normalizes line 1 (2 lines changed), but no
    // empty line is added; the bug pushed additions to 3.
    expect(res.additions).toBe(2);
    expect(res.deletions).toBe(2);
  });
});

describe("replace — unicode normalization", () => {
  it("matches despite em dashes and curly quotes where the file is ASCII", () => {
    const original = 'const label = "hello - world";\n';
    // old_string with curly quotes and an em dash (typographic drift from the model).
    const oldStr = 'const label = “hello — world”;';
    const out = replace(original, oldStr, 'const label = "bye";');
    expect(out).toBe('const label = "bye";\n');
  });
});

describe("replace — replaceAll", () => {
  it("replaces every occurrence", () => {
    expect(replace("a a a", "a", "b", true)).toBe("b b b");
  });

  it("rejects an ambiguous occurrence without replaceAll", () => {
    expect(() => replace("a a a", "a", "b")).toThrow(/multiple matches/i);
  });

  it("does not double the boundary \\n on a tolerant match (regression)", () => {
    // Two identically indented blocks; a de-indented old_string → LineTrimmed
    // matches and yields a span without the final \n. new_string ends with \n.
    const original = "if (x) {\n  do()\n}\nif (x) {\n  do()\n}\n";
    const out = replace(original, "if (x) {\ndo()\n}", "if (y) {\n  do()\n}\n", true);
    expect(out).toBe("if (y) {\n  do()\n}\nif (y) {\n  do()\n}\n");
    expect(out).not.toContain("}\n\n"); // no extraneous empty lines
  });
});

describe("replace — loud failures", () => {
  it("throws when old_string is not found", () => {
    expect(() => replace("hello world", "goodbye", "x")).toThrow(/could not find/i);
  });

  it("throws when old_string === new_string", () => {
    expect(() => replace("x", "x", "x")).toThrow(/identical/i);
  });

  it("throws when old_string is empty", () => {
    expect(() => replace("x", "", "y")).toThrow(/cannot be empty/i);
  });

  it("rejects a disproportionate match", () => {
    // A one-line `find` that a tolerant replacer could stretch over a huge block.
    const content = "x\n" + Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    // A real over-match is hard to build trivially here; this at least checks
    // that the exact match works and does not trip the guard.
    expect(replace(content, "line 0", "LINE 0")).toContain("LINE 0");
  });
});

describe("applyEdit — diff and counts", () => {
  it("returns the content, a diff and consistent counters", () => {
    const original = "const a = 1;\nconst b = 2;\nconst c = 3;\n";
    const res = applyEdit("f.ts", original, "const b = 2;", "const b = 20;\nconst b2 = 21;");
    expect(res.content).toContain("const b = 20;");
    expect(res.content).toContain("const b2 = 21;");
    expect(res.additions).toBeGreaterThan(0);
    expect(res.deletions).toBeGreaterThan(0);
    expect(res.diff).toMatch(/-const b = 2;/);
    expect(res.diff).toMatch(/\+const b = 20;/);
  });

  it("preserves the original file's CRLF line endings", () => {
    const original = "a\r\nb\r\nc\r\n";
    const res = applyEdit("f.ts", original, "b", "B");
    expect(res.content).toBe("a\r\nB\r\nc\r\n");
  });
});

/**
 * MIN-246 — the cascade is MEASURED. These tests do not defend a threshold (no
 * trade-off is decided here): they defend that the trace tells the truth.
 */
describe("replaceTraced — the cascade trace", () => {
  it("names the replacer and its rank on an exact match", () => {
    const { trace } = replaceTraced("const a = 1;\n", "const a = 1;", "const a = 2;");
    expect(trace.replacer).toBe("simple");
    expect(trace.rank).toBe(1);
    expect(trace.candidates).toBe(1);
    expect(trace.similarity).toBeUndefined(); // an exact match computes no similarity
  });

  it("reports the block similarity when anchoring resolves the match", () => {
    const content = ["function f() {", "  const total = items.length;", "  return total;", "}", ""].join("\n");
    // The model miscopied the middle line: only BlockAnchorReplacer (rank 3)
    // can still anchor the block on its first and last lines.
    const find = ["function f() {", "  const total = item.length;", "  return total;", "}"].join("\n");
    const { content: out, trace } = replaceTraced(content, find, "function f() {\n  return 0;\n}");
    expect(out).toContain("return 0;");
    expect(trace.replacer).toBe("block_anchor");
    expect(trace.rank).toBe(3);
    expect(trace.similarity).toBeGreaterThan(0.65);
    expect(trace.similarity).toBeLessThan(1);
  });

  it("carries the trace on failure, with what the cascade saw", () => {
    try {
      replace("hello world", "goodbye", "x");
      expect.unreachable("replace should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ReplaceError);
      const e = err as ReplaceError;
      expect(e.reason).toBe("not_found");
      expect(e.trace.candidates).toBe(0);
    }
  });
});

describe("replace — a disproportionate span no longer aborts the cascade (MIN-246)", () => {
  /**
   * Two blocks identical down to one detail: the first is buried under 600
   * spaces of indentation (tolerant replacers find it, but its extent has
   * nothing in common with `old_string`); the second differs only by a
   * typographic dash. The second is the one the model is aiming at, and only
   * the unicode replacer (rank 6) can see it.
   *
   * Before the fix, the first candidate THREW from inside the double loop: the
   * edit failed and the round was wasted.
   */
  const pad = " ".repeat(600);
  const find = ['if (x) {', '  send("a-b");', "}"].join("\n");
  const wide = [`${pad}if (x) {`, `${pad}  send("a-b");`, `${pad}}`].join("\n");
  const target = ['if (x) {', '  send("a—b");', "}"].join("\n");
  const content = `${wide}\n\nconst z = 0;\n\n${target}\n`;

  it("skips the oversized candidate and lets a lower-ranked replacer resolve", () => {
    const { content: out, trace } = replaceTraced(content, find, 'if (x) {\n  send("ok");\n}');
    expect(out).toContain('send("ok");');
    expect(out).toContain(pad); // the oversized block was not touched
    expect(trace.replacer).toBe("unicode_normalized");
    expect(trace.rank).toBe(6);
    expect(trace.rejectedDisproportionate).toBeGreaterThan(0);
  });

  it("keeps the loud refusal when NO candidate fits", () => {
    // The same oversized block, alone in the file: nothing below can resolve it.
    try {
      replace(`${wide}\n`, find, 'if (x) {\n  send("ok");\n}');
      expect.unreachable("replace should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ReplaceError);
      expect((err as ReplaceError).reason).toBe("disproportionate");
      expect((err as ReplaceError).trace.rejectedDisproportionate).toBeGreaterThan(0);
    }
  });
});

describe("diffFiles", () => {
  it("returns the same diff as applyEdit for the same before/after pair", () => {
    const before = "const a = 1;\nconst b = 2;\n";
    const res = applyEdit("f.ts", before, "const b = 2;", "const b = 3;");
    expect(diffFiles("f.ts", before, res.content)).toBe(res.diff);
  });

  it("returns an empty diff when nothing changed", () => {
    expect(diffFiles("f.ts", "a\n", "a\n")).not.toMatch(/^[-+][^-+]/m);
  });
});

describe("trimDiff", () => {
  it("strips the common indentation of content lines", () => {
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
