import { describe, expect, it } from "vitest";
import { resolveWithin, resolveReadable, assertNotGit } from "./repo-path";
import { cloudLayout, layoutForRoot } from "./harness-layout";

/**
 * LES GARDE-FOUS DE CHEMIN, REJOUÉS SUR DEUX RACINES (MIN-354).
 *
 * Ces fonctions prenaient déjà leur base en argument, mais un seul appelant la
 * leur donnait, et c'était toujours `/vercel/sandbox/repo`. Le contrat qu'elles
 * tiennent n'a donc jamais été exercé ailleurs — et « ailleurs » est précisément
 * ce que le lot ouvre : un dépôt de travail sur le disque d'un développeur.
 *
 * D'où la boucle sur DEUX layouts. Ce qu'elle garde n'est pas une valeur de plus,
 * c'est une propriété : **rien de ce qui refuse ici ne dépend du préfixe**. Une
 * garde qui ne tiendrait que sous `/vercel` n'est pas une garde, c'est une
 * coïncidence — et sur un vrai poste, elle serait le seul obstacle entre le
 * modèle et `~/.ssh`.
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
      // `<racine>/repo-evil` ne doit pas passer pour être dans `repo`.
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
      // `<sorties>-evil` n'est pas `<sorties>` : il ne matche pas l'exception, donc
      // il retombe en chemin dépôt-relatif (et reste sous le dépôt) au lieu d'être
      // lu tel quel.
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

    /**
     * LE DOSSIER PERSONNEL, QUI N'EXISTE QUE HORS MICROVM. Un `~` développé par
     * le modèle donne un absolu ordinaire : il ne vise aucune exception, il est
     * re-rooté dans le dépôt, et rien du vrai `$HOME` n'est lu.
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
      // .gitignore n'est PAS dans .git/
      expect(() => assertNotGit(BASE, `${BASE}/.gitignore`, ".gitignore")).not.toThrow();
    });

    /**
     * MIN-360 — CE QUE LE DISQUE RÉEL AJOUTE.
     *
     * Le préfixe brut sur la racine tenait tant que le dépôt était un clone
     * jetable sur l'ext4 d'une microVM. Sur le Mac de quelqu'un, il rate deux
     * chemins qui désignent exactement le même pouvoir : un hook.
     */
    it("replie la casse — APFS ne distingue pas `.GIT/` de `.git/`", () => {
      expect(() => assertNotGit(BASE, `${BASE}/.GIT/hooks/pre-commit`, ".GIT/hooks/pre-commit"))
        .toThrow(/\.git/i);
      expect(() => assertNotGit(BASE, `${BASE}/.Git/config`, ".Git/config")).toThrow(/\.git/i);
    });

    it("refuse un `.git` IMBRIQUÉ, pas seulement celui de la racine", () => {
      // Sous-module, dépôt imbriqué, fixture de test : le hook y a le même pouvoir.
      expect(() => assertNotGit(BASE, `${BASE}/packages/ui/.git/hooks/post-checkout`, "packages/ui/.git/hooks/post-checkout"))
        .toThrow(/\.git/i);
    });

    it("ne se laisse pas troubler par une racine qui contient le mot", () => {
      // La racine est donnée par le harness : ce qui s'y trouve ne vient pas du
      // modèle, et seul ce qui est SOUS elle est inspecté.
      const root = "/Users/dev/.github/minddy";
      expect(() => assertNotGit(root, `${root}/lib/x.ts`, "lib/x.ts")).not.toThrow();
      expect(() => assertNotGit(root, `${root}/.git/config`, ".git/config")).toThrow(/\.git/i);
    });
  });
});
