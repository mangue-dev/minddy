import { describe, expect, it } from "vitest";

import {
  assertUsableLayout,
  cloudLayout,
  layoutForCurrentRepo,
  layoutForRoot,
  runScopedRoot,
  CLOUD_SANDBOX_ROOT,
  type HarnessLayout,
} from "./harness-layout";

/**
 * MIN-354 — le layout du harness, devenu une valeur du run.
 *
 * Logique pure, testée comme [prune.test.ts](prune.test.ts) : on appelle, on
 * assert. Ce que ce fichier garde tient en trois faits, et aucun n'est un goût :
 *
 *  1. **Le cloud ne bouge pas.** Ce lot ne déplace rien en production ; il
 *     calcule ce qui était écrit. Une dérive d'un seul de ces six chemins
 *     laisserait le binaire opencode cuit à côté de celui que le harness
 *     cherche, ou le `.tsbuildinfo` dans le `git add -A` de fin de tour.
 *  2. **Deux runs sont disjoints.** C'est la raison d'être du ticket : sur une
 *     machine, deux tours simultanés ne doivent partager ni dépôt, ni job, ni
 *     base SQLite, ni sorties de tools.
 *  3. **Un layout douteux est refusé.** `repoDir` est la racine de sécurité de
 *     quatre garde-fous, et elle arrive désormais par un JSON.
 */

describe("le layout du cloud", () => {
  it("rend exactement les chemins d'avant MIN-354", () => {
    // Ces six valeurs étaient des constantes de module. Les voir écrites ici est
    // ce qui dit qu'on a paramétré sans DÉPLACER : un run de production doit
    // trouver son dépôt, son binaire et son snapshot là où ils ont toujours été.
    expect(cloudLayout()).toEqual({
      root: "/vercel/sandbox",
      repoDir: "/vercel/sandbox/repo",
      toolOutputDir: "/vercel/sandbox/tool-output",
      harnessDir: "/vercel/sandbox/harness",
      typecheckDir: "/vercel/sandbox/typecheck",
      opencodeDir: "/vercel/oc",
    });
  });

  it("passe son propre contrôle", () => {
    expect(() => assertUsableLayout(cloudLayout())).not.toThrow();
  });
});

describe("la dérivation", () => {
  it("met tout ce qui est du run sous sa racine, et rien d'autre", () => {
    const layout = layoutForRoot("/work/r-1", "/opt/oc");
    for (const dir of [layout.repoDir, layout.toolOutputDir, layout.harnessDir, layout.typecheckDir]) {
      expect(dir.startsWith("/work/r-1/")).toBe(true);
    }
    // Le binaire, lui, est propre à la MACHINE : 144 Mo qu'on ne réinstalle pas
    // par ticket.
    expect(layout.opencodeDir).toBe("/opt/oc");
  });

  /**
   * LE HARNESS ET LES SORTIES SONT FRÈRES DU DÉPÔT, JAMAIS SES ENFANTS. C'est ce
   * qui fait que le `git add -A` de fin de tour ne les voit pas — sans quoi le
   * job du tour, qui porte l'historique de la conversation ET l'URL de push,
   * partirait dans un commit du dépôt de l'utilisateur puis dans sa PR.
   */
  it("garde le harness et les sorties HORS du dépôt", () => {
    const layout = layoutForRoot("/work/r-1", "/opt/oc");
    for (const dir of [layout.toolOutputDir, layout.harnessDir, layout.typecheckDir]) {
      expect(dir.startsWith(`${layout.repoDir}/`)).toBe(false);
    }
  });

  /**
   * MIN-358 — le mode dépôt courant : le dépôt est celui de l'utilisateur, tout
   * le reste appartient au run. C'est le seul layout où `repoDir` n'est pas
   * `<root>/repo`, et il passe le même contrôle que les autres.
   */
  it("laisse le dépôt courant où il est, sans y installer le harness", () => {
    const layout = layoutForCurrentRepo("/work/r-1", "/Users/x/Projets/app/", "/opt/oc");
    expect(layout.repoDir).toBe("/Users/x/Projets/app");
    expect(layout.harnessDir).toBe("/work/r-1/harness");
    for (const dir of [layout.toolOutputDir, layout.harnessDir, layout.typecheckDir]) {
      expect(dir.startsWith(`${layout.repoDir}/`)).toBe(false);
    }
    expect(() => assertUsableLayout(layout)).not.toThrow();
  });

  it("absorbe un slash final plutôt que de produire un `//`", () => {
    // `resolveWithin` compare à `${base}/` : un double slash y échapperait à la
    // comparaison de préfixe d'un côté et pas de l'autre.
    expect(layoutForRoot("/work/r-1/", "/opt/oc/")).toEqual(layoutForRoot("/work/r-1", "/opt/oc"));
  });
});

describe("deux runs sur une machine", () => {
  /**
   * LE PIÈGE QUE LE TICKET EXISTE POUR REFERMER. Sur une microVM, un run avait sa
   * machine ; sur un poste, deux tickets lancés à la suite partageaient tout — le
   * job réécrit sous le premier, une seule base SQLite opencode pour les deux, un
   * dossier de sorties commun.
   */
  it("ne partagent aucun chemin de run", () => {
    const a = layoutForRoot(runScopedRoot("/work", "run-a"), "/opt/oc");
    const b = layoutForRoot(runScopedRoot("/work", "run-b"), "/opt/oc");
    const perRun = (l: HarnessLayout) => [l.root, l.repoDir, l.toolOutputDir, l.harnessDir, l.typecheckDir];
    for (const [left, right] of perRun(a).map((v, i) => [v, perRun(b)[i]])) {
      expect(left).not.toBe(right);
    }
    // …et aucun n'est préfixe de l'autre : `/work/run-a` ne doit pas passer pour
    // être dans `/work/run-a-bis`, ni l'inverse.
    expect(a.root.startsWith(`${b.root}/`)).toBe(false);
    expect(b.root.startsWith(`${a.root}/`)).toBe(false);
  });

  it("partagent en revanche le binaire opencode", () => {
    const a = layoutForRoot(runScopedRoot("/work", "run-a"), "/opt/oc");
    const b = layoutForRoot(runScopedRoot("/work", "run-b"), "/opt/oc");
    expect(a.opencodeDir).toBe(b.opencodeDir);
  });

  /**
   * L'identifiant vient de la base, mais il BORNE une racine : un `/` ou un `..`
   * qui y passerait ferait sortir le run de son dossier de travail, et c'est
   * cette racine-là qui borne tout le reste.
   */
  it("neutralise un identifiant qui tenterait de sortir du dossier de travail", () => {
    for (const runId of ["../../etc", "a/b", "..", "", "/etc/passwd"]) {
      const root = runScopedRoot("/work", runId);
      expect(root.startsWith("/work/")).toBe(true);
      // Ce qui compte : plus aucun séparateur après le dossier de travail, donc
      // plus de segment `..` à remonter — la racine ne peut plus sortir.
      expect(root.slice("/work/".length)).not.toContain("/");
      expect(root.slice("/work/".length).startsWith(".")).toBe(false);
    }
    expect(runScopedRoot("/work", "a/b")).toBe("/work/a-b");
    expect(runScopedRoot("/work", "")).toBe("/work/run");
  });
});

describe("le contrôle du layout", () => {
  const base = layoutForRoot("/work/r-1", "/opt/oc");

  it("refuse un chemin relatif", () => {
    // `resolveWithin("repo", "../x")` ne sort de rien du tout : la garde
    // deviendrait muette, pas fausse — ce qui est pire.
    expect(() => assertUsableLayout({ ...base, repoDir: "repo" })).toThrow(/absolute/i);
  });

  it("refuse un slash final", () => {
    expect(() => assertUsableLayout({ ...base, repoDir: "/work/r-1/repo/" })).toThrow(/slash/i);
  });

  /**
   * MIN-358 : un dépôt HORS de la racine du run est désormais légitime — c'est
   * le mode dépôt courant, où le dépôt est celui de l'utilisateur. Ce qui reste
   * refusé est la seule chose que la règle protégeait vraiment : un harness
   * installé DANS le dépôt, donc visible du `git status` de quelqu'un.
   */
  it("accepte un dépôt hors de la racine du run (mode dépôt courant)", () => {
    expect(() => assertUsableLayout({ ...base, repoDir: "/Users/x/Projets/app" })).not.toThrow();
  });

  it("refuse un harness installé DANS le dépôt", () => {
    const inside = layoutForCurrentRepo("/work/r-1", "/work/r-1", "/opt/oc");
    expect(() => assertUsableLayout(inside)).toThrow(/outside the repository/i);
  });

  it("refuse un dossier du run hors de la racine du run", () => {
    expect(() => assertUsableLayout({ ...base, harnessDir: "/ailleurs/harness" })).toThrow(
      /under root/i,
    );
  });

  it("refuse un champ manquant", () => {
    expect(() =>
      assertUsableLayout({ ...base, harnessDir: undefined as unknown as string }),
    ).toThrow(/absolute/i);
  });

  it("laisse le binaire opencode vivre hors de la racine du run", () => {
    // C'est le SEUL chemin qui a le droit d'être ailleurs, et c'est délibéré.
    expect(() =>
      assertUsableLayout({ ...base, opencodeDir: `${CLOUD_SANDBOX_ROOT}/../oc` }),
    ).not.toThrow();
  });
});
