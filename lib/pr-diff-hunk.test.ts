import { describe, expect, it } from "vitest";
import { hunkPatch, hunkPreview } from "@/lib/pr-diff-hunk";

/** A `diff_hunk` such as GitHub serves with a review comment. */
const HUNK = [
  "@@ -10,6 +10,7 @@ export function probe() {",
  "   const a = 1;",
  "   const b = 2;",
  "-  return a + b;",
  "+  const c = 3;",
  "+  return a + b + c;",
].join("\n");

describe("hunkPreview", () => {
  it("numérote les deux côtés et garde la fin du hunk — la ligne commentée", () => {
    expect(hunkPreview(HUNK, 4)).toEqual([
      { type: "context", content: "  const b = 2;", oldLine: 11, newLine: 11 },
      { type: "del", content: "  return a + b;", oldLine: 12, newLine: null },
      { type: "add", content: "  const c = 3;", oldLine: null, newLine: 12 },
      { type: "add", content: "  return a + b + c;", oldLine: null, newLine: 13 },
    ]);
  });

  it("rend tout le hunk quand on ne le borne pas", () => {
    expect(hunkPreview(HUNK, 0)).toHaveLength(5);
  });

  it("saute l'annotation « \\ No newline at end of file », qui n'est pas du code", () => {
    const lines = hunkPreview(
      ["@@ -1,2 +1,2 @@", "-a", "+b", "\\ No newline at end of file"].join("\n"),
      10,
    );
    expect(lines.map((l) => l.content)).toEqual(["a", "b"]);
  });

  it("rend vide sans hunk — GitLab n'en sert aucun, l'ancre seule prend le relais", () => {
    expect(hunkPreview("")).toEqual([]);
    expect(hunkPreview("pas un hunk du tout")).toEqual([]);
  });

  it("part du bon numéro même quand l'en-tête n'a pas de compte de lignes", () => {
    const [line] = hunkPreview("@@ -42 +99 @@\n a", 1);
    expect(line).toEqual({ type: "context", content: "a", oldLine: 42, newLine: 99 });
  });
});

describe("hunkPatch", () => {
  it("entoure le fragment du fichier que la lib de diff attend", () => {
    expect(hunkPatch("lib/probe.ts", HUNK, 0)).toBe(
      [
        "diff --git a/lib/probe.ts b/lib/probe.ts",
        "--- a/lib/probe.ts",
        "+++ b/lib/probe.ts",
        "@@ -10,3 +10,4 @@",
        "   const a = 1;",
        "   const b = 2;",
        "-  return a + b;",
        "+  const c = 3;",
        "+  return a + b + c;",
        "",
      ].join("\n"),
    );
  });

  it("RECALCULE l'en-tête sur la tranche gardée — sinon les numéros mentent", () => {
    // A discarded context line moves BOTH sides one step forward: the
    // hunk starts from 10, the slice therefore starts from 11.
    expect(hunkPatch("a.ts", HUNK, 4).split("\n")[3]).toBe("@@ -11,2 +11,3 @@");
  });

  it("dit un côté vide comme git le dit : le numéro d'AVANT, et un compte nul", () => {
    // The last two lines are additions: the base side has nothing left, and
    // inserts after line 12 (the last line deleted).
    expect(hunkPatch("a.ts", HUNK, 2).split("\n")[3]).toBe("@@ -12,0 +12,2 @@");
  });

  it("rend vide sans hunk — l'appelant n'affiche alors pas d'extrait", () => {
    expect(hunkPatch("a.ts", "")).toBe("");
    expect(hunkPatch("a.ts", "pas un hunk du tout")).toBe("");
    expect(hunkPatch("a.ts", "@@ -1,0 +1,0 @@")).toBe("");
  });

  it("keeps every line in a multi-line review range instead of only its end", () => {
    const range = [
      "@@ -233,12 +233,12 @@",
      " context 233",
      " context 234",
      " context 235",
      " selected 236",
      " selected 237",
      " selected 238",
      " selected 239",
      " selected 240",
      " selected 241",
      " selected 242",
      " selected 243",
      " selected 244",
    ].join("\n");

    const patch = hunkPatch("a.ts", range, 4, {
      startLine: 236,
      endLine: 244,
      side: "RIGHT",
    });

    expect(patch).toContain(" selected 236");
    expect(patch).toContain(" selected 244");
    expect(patch.split("\n")[3]).toBe("@@ -233,12 +233,12 @@");
  });

  it("keeps the whole hunk when maxLines is zero, even with a focused range", () => {
    const patch = hunkPatch("a.ts", HUNK, 0, {
      startLine: 12,
      endLine: 13,
      side: "RIGHT",
    });

    expect(patch).toContain("   const a = 1;");
    expect(patch).toContain("+  return a + b + c;");
  });
});
