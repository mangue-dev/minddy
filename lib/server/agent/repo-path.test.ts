import { describe, expect, it } from "vitest";
import { resolveWithin, resolveReadable, assertNotGit } from "./repo-path";
import { cloudLayout, layoutForRoot } from "./harness-layout";

/**
 * THE PATH GUARDS, REPLAYED ON TWO ROOTS (MIN-354).
 *
 * These functions already took their base as an argument, but only one caller gave them the
 *, and it was always `/vercel/sandbox/repo`. The contract they
 * hold has therefore never been exercised elsewhere — and "elsewhere" is precisely
 * what the batch opens: a working repository on a developer's disk.
 *
 * Hence the loop on TWO layouts. What it keeps is not one more value,
 * it is a property: **nothing that refuses here depends on the prefix**. A
 * guard that would only fit under `/vercel` is not a guard, it's a
 * coincidence — and on a real workstation, it would be the only obstacle between the
 * model and `~/.ssh`.
 */
const ROOTS = [
  ["microVM", cloudLayout()],
  ["poste de travail", layoutForRoot("/Users/dev/Library/Application Support/minddy/runs/r-1", "/Users/dev/Library/Application Support/minddy/oc")],
] as const;

describe.each(ROOTS)("garde-fous de chemin (%s)", (_name, layout) => {
  const BASE = layout.repoDir;
  const TOOL_OUTPUT = layout.toolOutputDir;

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
      // `<racine>/repo-evil` should not be considered to be in `repo`.
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
      // `<sorties>-evil` is not `<sorties>`: it does not match the exception, so
      // it falls back to the repository-relative path (and remains under the repository) instead of being
      // lu tel quel.
      expect(readable(`${TOOL_OUTPUT}-evil/x`).startsWith(`${BASE}/`)).toBe(true);
    });

    it("ne laisse JAMAIS un absolu quelconque atteindre l'hôte", () => {
      // /etc/passwd does not intend any exception: it is re-rooted in the repository (where it
      // does not exist) rather than read. The property that counts: the result remains
      // under an authorized root.
      const resolved = readable("/etc/passwd");
      expect(resolved).toBe(`${BASE}/etc/passwd`);
      expect(resolved.startsWith(`${BASE}/`)).toBe(true);
    });

    /**
 * THE PERSONAL FILE, WHICH ONLY EXISTS OUTSIDE MICROVM. A `~` developed by
 * the model gives an ordinary absolute: it does not target any exceptions, it is
 * re-rooted in the repository, and nothing from the real `$HOME` is read.
 */
    it("re-roote un chemin du dossier personnel au lieu de le lire", () => {
      const resolved = readable("/Users/dev/.ssh/id_ed25519");
      expect(resolved).toBe(`${BASE}/Users/dev/.ssh/id_ed25519`);
    });
  });

  describe("assertNotGit", () => {
    it("refuse d'écrire dans .git", () => {
      expect(() => assertNotGit(BASE, `${BASE}/.git/hooks/pre-commit`, ".git/hooks/pre-commit")).toThrow(/\.git/i);
      expect(() => assertNotGit(BASE, `${BASE}/.git`, ".git")).toThrow(/\.git/i);
    });

    it("autorise un fichier normal", () => {
      expect(() => assertNotGit(BASE, `${BASE}/src/x.ts`, "src/x.ts")).not.toThrow();
      // .gitignore is NOT in .git/
      expect(() => assertNotGit(BASE, `${BASE}/.gitignore`, ".gitignore")).not.toThrow();
    });

    /**
 * MIN-360 — WHAT THE ACTUAL DISK ADDED.
 *
 * The raw prefix on the root held as long as the repository was a disposable clone
 * on the ext4 of a microVM. On someone's Mac, they're missing two
 * paths that denote the exact same power: a hook.
 */
    it("replie la casse — APFS ne distingue pas `.GIT/` de `.git/`", () => {
      expect(() => assertNotGit(BASE, `${BASE}/.GIT/hooks/pre-commit`, ".GIT/hooks/pre-commit"))
        .toThrow(/\.git/i);
      expect(() => assertNotGit(BASE, `${BASE}/.Git/config`, ".Git/config")).toThrow(/\.git/i);
    });

    it("refuse un `.git` IMBRIQUÉ, pas seulement celui de la racine", () => {
      // Submodule, nested repository, test fixture: the hook has the same power.
      expect(() => assertNotGit(BASE, `${BASE}/packages/ui/.git/hooks/post-checkout`, "packages/ui/.git/hooks/post-checkout"))
        .toThrow(/\.git/i);
    });

    it("ne se laisse pas troubler par une racine qui contient le mot", () => {
      // The root is given by the harness: what is there does not come from
      // model, and only what is UNDER it is inspected.
      const root = "/Users/dev/.github/minddy";
      expect(() => assertNotGit(root, `${root}/lib/x.ts`, "lib/x.ts")).not.toThrow();
      expect(() => assertNotGit(root, `${root}/.git/config`, ".git/config")).toThrow(/\.git/i);
    });
  });
});
