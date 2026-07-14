import { describe, expect, it } from "vitest";
import { resolveWithin, assertNotGit } from "./repo-path";

const BASE = "/vercel/sandbox/repo";

describe("resolveWithin", () => {
  it("résout un chemin normal sous la base", () => {
    expect(resolveWithin(BASE, "src/app/page.tsx")).toBe(`${BASE}/src/app/page.tsx`);
  });

  it("strippe les slashes de tête", () => {
    expect(resolveWithin(BASE, "/src/x.ts")).toBe(`${BASE}/src/x.ts`);
  });

  it("normalise les `.` et `..` internes qui restent dans le dépôt", () => {
    expect(resolveWithin(BASE, "src/../lib/x.ts")).toBe(`${BASE}/lib/x.ts`);
  });

  it("LÈVE si le chemin s'échappe via `..`", () => {
    expect(() => resolveWithin(BASE, "../../etc/passwd")).toThrow(/escapes/i);
    expect(() => resolveWithin(BASE, "src/../../../etc/x")).toThrow(/escapes/i);
  });

  it("LÈVE sur un préfixe frère trompeur", () => {
    // /vercel/sandbox/repo-evil ne doit pas passer pour être dans repo.
    expect(() => resolveWithin(BASE, "../repo-evil/x")).toThrow(/escapes/i);
  });
});

describe("assertNotGit", () => {
  it("refuse d'écrire dans .git", () => {
    expect(() => assertNotGit(BASE, `${BASE}/.git/hooks/pre-commit`, ".git/hooks/pre-commit")).toThrow(/\.git/i);
    expect(() => assertNotGit(BASE, `${BASE}/.git`, ".git")).toThrow(/\.git/i);
  });

  it("autorise un fichier normal", () => {
    expect(() => assertNotGit(BASE, `${BASE}/src/x.ts`, "src/x.ts")).not.toThrow();
    // .gitignore n'est PAS dans .git/
    expect(() => assertNotGit(BASE, `${BASE}/.gitignore`, ".gitignore")).not.toThrow();
  });
});
