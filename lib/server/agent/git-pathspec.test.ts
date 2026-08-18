import { describe, expect, it } from "vitest";
import { grepPathspecs, globPathspecs, expandBraces } from "./git-pathspec";

/**
 * Tests git pathspecs. Two critical points: the INTERSECTION of path + glob
 * (a single pathspec:(glob)path/glob, not the OR union of two pathspecs), and the
 * development of BRACES (git does not do this — MIN-116), where the OR union is
 * this time exactly what we wants.
 */

describe("grepPathspecs", () => {
  it("intersecte path et glob en un seul pathspec", () => {
    expect(grepPathspecs("lib/server", "**/*.ts")).toEqual([":(glob)lib/server/**/*.ts"]);
  });

  it("glob seul → pathspec glob", () => {
    expect(grepPathspecs(undefined, "**/*.md")).toEqual([":(glob)**/*.md"]);
  });

  it("path seul → pathspec de sous-arbre", () => {
    expect(grepPathspecs("app/api", undefined)).toEqual(["app/api"]);
  });

  it("ni l'un ni l'autre → aucun pathspec", () => {
    expect(grepPathspecs(undefined, undefined)).toEqual([]);
  });

  it("normalise les slashes de bord et rend le glob nu récursif", () => {
    expect(grepPathspecs("/lib/server/", "*.ts")).toEqual([":(glob)lib/server/**/*.ts"]);
  });

  it("rend un glob nu (sans /) récursif", () => {
    expect(grepPathspecs(undefined, "*.ts")).toEqual([":(glob)**/*.ts"]);
  });

  // MIN-116: the form that the model writes spontaneously. Without development, git
  // matches NOTHING and the tool responds “(no matches)” on code that exists.
  it("développe les accolades en un pathspec par extension", () => {
    expect(grepPathspecs(undefined, "**/*.{ts,tsx}")).toEqual([
      ":(glob)**/*.ts",
      ":(glob)**/*.tsx",
    ]);
  });

  it("développe les accolades DANS le sous-arbre demandé", () => {
    expect(grepPathspecs("lib", "**/*.{ts,tsx}")).toEqual([
      ":(glob)lib/**/*.ts",
      ":(glob)lib/**/*.tsx",
    ]);
  });

  it("rend récursive chaque alternative d'un glob nu", () => {
    expect(grepPathspecs(undefined, "*.{ts,md}")).toEqual([":(glob)**/*.ts", ":(glob)**/*.md"]);
  });

  it("n'ajoute `**/` qu'aux alternatives qui n'ont pas de /", () => {
    expect(grepPathspecs(undefined, "{lib/*.ts,*.md}")).toEqual([
      ":(glob)lib/*.ts",
      ":(glob)**/*.md",
    ]);
  });

  /**
 * MIN-226 — the form that the model writes when it wants to search IN A
 * FILE: both fields carry the path, natural reading of "where
 * to search" + "what to search". Nested, it gave
 * `:(glob)components/foo.tsx/components/foo.tsx` — no matches, git in code 1,
 * and “(no matches)” on code that exists. Five probes of this form have
 * lied about the run that wrote the plan for MIN-226.
 */
  it("path de FICHIER : le glob tombe, on cherche dans ce fichier", () => {
    expect(
      grepPathspecs("components/objective-side-panel.tsx", "components/objective-side-panel.tsx"),
    ).toEqual(["components/objective-side-panel.tsx"]);
  });

  /**
 * The EXACT case of the MIN-226 run: the probe on the page board. The brackets
 * in a dynamic route are glob metacharacters, and counting them as
 * such made the guard blind to the only path that mattered.
 */
  it("path de fichier + glob quelconque : le fichier gagne, crochets de route compris", () => {
    expect(grepPathspecs("app/(app)/projects/[id]/page.tsx", "**/*.{ts,tsx}")).toEqual([
      "app/(app)/projects/[id]/page.tsx",
    ]);
  });

  it("path == glob sur un DOSSIER : même piège, même garde", () => {
    expect(grepPathspecs("components", "components")).toEqual(["components"]);
  });

  it("un dossier reste un dossier : l'intersection normale ne bouge pas", () => {
    expect(grepPathspecs("lib/server/agent", "**/*.ts")).toEqual([
      ":(glob)lib/server/agent/**/*.ts",
    ]);
  });

  // The point of guarding is NOT to guess right, it's to never shrink:
  // a `path` carrying metacharacters remains a pattern, and intersects.
  it("un path qui contient un métacaractère n'est pas pris pour un fichier", () => {
    expect(grepPathspecs("app/**/api", "*.ts")).toEqual([":(glob)app/**/api/**/*.ts"]);
  });

  it("un dossier sans extension n'est pas pris pour un fichier", () => {
    expect(grepPathspecs("lib/v2", "*.ts")).toEqual([":(glob)lib/v2/**/*.ts"]);
  });
});

describe("globPathspecs", () => {
  it("intersecte path et pattern", () => {
    expect(globPathspecs("**/*.tsx", "components")).toEqual([":(glob)components/**/*.tsx"]);
  });

  it("sans path → pattern seul", () => {
    expect(globPathspecs("**/*.ts")).toEqual([":(glob)**/*.ts"]);
  });

  it("rend un pattern nu récursif", () => {
    expect(globPathspecs("*.ts")).toEqual([":(glob)**/*.ts"]);
  });

  it("développe les accolades", () => {
    expect(globPathspecs("**/*.{ts,tsx,md}")).toEqual([
      ":(glob)**/*.ts",
      ":(glob)**/*.tsx",
      ":(glob)**/*.md",
    ]);
  });

  it("path de FICHIER : ce fichier, et pas un pathspec imbriqué (MIN-226)", () => {
    expect(globPathspecs("**/*.tsx", "components/secondary-sidebar.tsx")).toEqual([
      "components/secondary-sidebar.tsx",
    ]);
  });
});

describe("expandBraces", () => {
  it("laisse intact un motif sans accolade", () => {
    expect(expandBraces("**/*.ts")).toEqual(["**/*.ts"]);
  });

  it("développe un groupe simple", () => {
    expect(expandBraces("*.{ts,tsx}")).toEqual(["*.ts", "*.tsx"]);
  });

  it("développe plusieurs groupes (produit cartésien)", () => {
    expect(expandBraces("{app,lib}/**/*.{ts,tsx}")).toEqual([
      "app/**/*.ts",
      "app/**/*.tsx",
      "lib/**/*.ts",
      "lib/**/*.tsx",
    ]);
  });

  it("développe les groupes imbriqués", () => {
    expect(expandBraces("*.{ts,{js,mjs}}")).toEqual(["*.ts", "*.js", "*.mjs"]);
  });

  it("laisse intact un motif aux accolades non équilibrées", () => {
    expect(expandBraces("onUpdateIssue={")).toEqual(["onUpdateIssue={"]);
    expect(expandBraces("*.{ts,tsx")).toEqual(["*.{ts,tsx"]);
  });

  it("ne coupe pas sur une virgule interne à une classe [...]", () => {
    expect(expandBraces("*.[a,b]")).toEqual(["*.[a,b]"]);
    expect(expandBraces("{x[a,b],y}.ts")).toEqual(["x[a,b].ts", "y.ts"]);
  });

  it("ignore une accolade échappée", () => {
    expect(expandBraces("a\\{b,c\\}")).toEqual(["a\\{b,c\\}"]);
  });

  it("rend le motif tel quel au-delà du plafond d'alternatives", () => {
    // 7 groups of 2 = 128 alternatives, beyond the 64 tolerated.
    const pathological = "{a,b}{c,d}{e,f}{g,h}{i,j}{k,l}{m,n}.ts";
    expect(expandBraces(pathological)).toEqual([pathological]);
  });
});
