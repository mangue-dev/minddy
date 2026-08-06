import { describe, expect, it } from "vitest";
import { hunkPatch, hunkPreview } from "@/lib/pr-diff-hunk";

/** Un `diff_hunk` tel que GitHub le sert avec un commentaire de review. */
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
    // Une ligne de contexte écartée fait avancer les DEUX côtés d'un cran : le
    // hunk part de 10, la tranche part donc de 11.
    expect(hunkPatch("a.ts", HUNK, 4).split("\n")[3]).toBe("@@ -11,2 +11,3 @@");
  });

  it("dit un côté vide comme git le dit : le numéro d'AVANT, et un compte nul", () => {
    // Les deux dernières lignes sont des ajouts : le côté base n'a plus rien, et
    // s'insère après la ligne 12 (la dernière ligne supprimée).
    expect(hunkPatch("a.ts", HUNK, 2).split("\n")[3]).toBe("@@ -12,0 +12,2 @@");
  });

  it("rend vide sans hunk — l'appelant n'affiche alors pas d'extrait", () => {
    expect(hunkPatch("a.ts", "")).toBe("");
    expect(hunkPatch("a.ts", "pas un hunk du tout")).toBe("");
    expect(hunkPatch("a.ts", "@@ -1,0 +1,0 @@")).toBe("");
  });
});
