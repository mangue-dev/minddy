import { describe, expect, it } from "vitest";
import { grepPathspecs, globPathspec } from "./git-pathspec";

/**
 * Tests des pathspecs git : le point critique est l'INTERSECTION de path + glob
 * (un seul pathspec :(glob)path/glob), pas l'union OR de deux pathspecs.
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
});

describe("globPathspec", () => {
  it("intersecte path et pattern", () => {
    expect(globPathspec("**/*.tsx", "components")).toBe(":(glob)components/**/*.tsx");
  });

  it("sans path → pattern seul", () => {
    expect(globPathspec("**/*.ts")).toBe(":(glob)**/*.ts");
  });

  it("rend un pattern nu récursif", () => {
    expect(globPathspec("*.ts")).toBe(":(glob)**/*.ts");
  });
});
