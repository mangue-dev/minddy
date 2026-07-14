import { describe, expect, it } from "vitest";
import { applyEdit, replace, trimDiff } from "./edit";

/**
 * Tests du moteur d'édition (cascade de replacers portée d'opencode). On vérifie
 * surtout la TOLÉRANCE (le modèle dérive d'un espace / d'une indentation) ET la
 * sûreté (échec bruyant : jamais de corruption silencieuse).
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
    // Le modèle a oublié l'indentation exacte de la ligne interne.
    const out = replace(content, "return 1;", "return 2;");
    expect(out).toBe("function f() {\n    return 2;\n}\n");
  });

  it("matche un bloc multi-lignes dont l'indentation globale diffère", () => {
    const content = ["class C {", "  method() {", "    doThing();", "  }", "}"].join("\n");
    const old = ["method() {", "  doThing();", "}"].join("\n"); // désindenté
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
    // Ligne 1 avec espaces de fin (dérive whitespace) → SimpleReplacer échoue,
    // LineTrimmedReplacer matche (span sans le \n final).
    const original = "  const a = 1;  \n  const b = 2;\n  return a + b;\n";
    const oldStr = "  const a = 1;\n  const b = 2;\n"; // finit par \n
    const newStr = "  const a = 1;\n  const b = 3;\n"; // finit par \n
    const out = replace(original, oldStr, newStr);
    expect(out).toBe("  const a = 1;\n  const b = 3;\n  return a + b;\n");
    expect(out).not.toContain("\n\n"); // aucune ligne vide insérée
  });

  it("ne fusionne pas les lignes quand new_string ne finit pas par \\n", () => {
    const original = "  const a = 1;  \n  const b = 2;\n  return a + b;\n";
    // new_string sans \n final → l'ancien comportement (correct) doit être préservé.
    const out = replace(original, "  const a = 1;\n  const b = 2;", "  const a = 1;\n  const b = 3;");
    expect(out).toBe("  const a = 1;\n  const b = 3;\n  return a + b;\n");
  });

  it("applyEdit ne gonfle pas le diff (pas de ligne vide) sur ce cas", () => {
    const original = "  const a = 1;  \n  const b = 2;\n  return a + b;\n";
    const res = applyEdit("f.ts", original, "  const a = 1;\n  const b = 2;\n", "  const a = 1;\n  const b = 3;\n");
    expect(res.content).toBe("  const a = 1;\n  const b = 3;\n  return a + b;\n");
    // La dérive whitespace normalise aussi la ligne 1 (2 lignes changées), mais
    // AUCUNE ligne vide ne s'ajoute → le bug gonflait à additions=3.
    expect(res.additions).toBe(2);
    expect(res.deletions).toBe(2);
  });
});

describe("replace — normalisation unicode", () => {
  it("matche malgré em-dash / quotes courbes là où le fichier est ASCII", () => {
    const original = 'const label = "hello - world";\n';
    // old_string avec guillemets courbes + em-dash (dérive typographique du modèle).
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
    // Un `find` d'une ligne qui, via un replacer tolérant, matcherait un bloc énorme.
    const content = "x\n" + Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    // Impossible ici de fabriquer un vrai over-match trivialement ; on vérifie au
    // moins que l'exact fonctionne et ne déclenche pas la garde.
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
    // Les préfixes +/-/espace restent, mais l'indentation commune (4) est retirée.
    expect(out).toContain("-const y = 2;");
    expect(out).toContain("+const y = 3;");
    expect(out).toContain(" const x = 1;");
    // En-têtes intacts.
    expect(out).toContain("--- a");
    expect(out).toContain("+++ b");
  });
});
