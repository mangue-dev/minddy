import { describe, expect, it } from "vitest";
import { resolveWithin, resolveReadable, assertNotGit } from "./repo-path";

const BASE = "/vercel/sandbox/repo";
const TOOL_OUTPUT = "/vercel/sandbox/tool-output";

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

describe("resolveReadable", () => {
  const readable = (p: string) => resolveReadable(BASE, [TOOL_OUTPUT], p);

  it("accepte un fichier du dossier de sorties de tools", () => {
    expect(readable(`${TOOL_OUTPUT}/pnpm-test-3.log`)).toBe(`${TOOL_OUTPUT}/pnpm-test-3.log`);
  });

  it("garde le comportement dépôt-relatif pour tout le reste", () => {
    expect(readable("lib/plan.ts")).toBe(`${BASE}/lib/plan.ts`);
    expect(() => readable("../../etc/passwd")).toThrow(/escapes/i);
  });

  it("LÈVE si un `..` sort du dossier lisible", () => {
    expect(() => readable(`${TOOL_OUTPUT}/../repo/.git/config`)).toThrow(/escapes/i);
    expect(() => readable(`${TOOL_OUTPUT}/../../../etc/passwd`)).toThrow(/escapes/i);
  });

  it("refuse le préfixe frère trompeur", () => {
    // /vercel/sandbox/tool-output-evil n'est pas /vercel/sandbox/tool-output : il
    // ne matche pas l'exception, donc il retombe en chemin dépôt-relatif (et reste
    // sous le dépôt) au lieu d'être lu tel quel.
    expect(readable(`${TOOL_OUTPUT}-evil/x`).startsWith(`${BASE}/`)).toBe(true);
  });

  it("ne laisse JAMAIS un absolu quelconque atteindre l'hôte", () => {
    // /etc/passwd ne vise aucune exception : il est re-rooté dans le dépôt (où il
    // n'existe pas) plutôt que lu. La propriété qui compte : le résultat reste
    // sous une racine autorisée.
    const resolved = readable("/etc/passwd");
    expect(resolved).toBe(`${BASE}/etc/passwd`);
    expect(resolved.startsWith(`${BASE}/`)).toBe(true);
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
