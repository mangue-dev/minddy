import { describe, expect, it } from "vitest";
import { grepPathspecs, globPathspecs, expandBraces } from "./git-pathspec";

/**
 * Tests des pathspecs git. Deux points critiques : l'INTERSECTION de path + glob
 * (un seul pathspec :(glob)path/glob, pas l'union OR de deux pathspecs), et le
 * développement des ACCOLADES (git ne le fait pas — MIN-116), où l'union OR est
 * cette fois exactement ce qu'on veut.
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

  // MIN-116 : la forme que le modèle écrit spontanément. Sans développement, git
  // ne matche RIEN et le tool répond « (no matches) » sur du code qui existe.
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
    // 7 groupes de 2 = 128 alternatives, au-delà des 64 tolérées.
    const pathological = "{a,b}{c,d}{e,f}{g,h}{i,j}{k,l}{m,n}.ts";
    expect(expandBraces(pathological)).toEqual([pathological]);
  });
});
