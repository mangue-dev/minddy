import { describe, expect, it } from "vitest";

import {
  filterLocalPayload,
  foreignPaths,
  homeOf,
  scrubPaths,
  withheldOutput,
} from "./local-uplink";

/**
 * MIN-361 — CE QUI REMONTE DE LA MACHINE DE L'UTILISATEUR.
 *
 * Logique PURE, testée comme [local-exec-scope.test.ts](../local-exec-scope.test.ts) :
 * on appelle, on assert. Ce qui compte ici, et qui décide de la forme de la
 * règle, c'est que **les deux erreurs coûtent** :
 *
 * - trop peu retenir fait monter le disque de quelqu'un dans une base de
 *   production, 30 jours, sous les yeux des membres du projet ;
 * - trop retenir vide le fil de ses sorties honnêtes — et une garde qui rend le
 *   produit inutilisable ne reste pas en place.
 *
 * D'où la moitié de ce fichier, qui teste ce qui ne doit PAS être retenu.
 */

const REPO = "/Users/clement/Projets/minddy";

describe("homeOf", () => {
  it("déduit la maison du dépôt, sans lire l'environnement", () => {
    expect(homeOf(REPO)).toBe("/Users/clement");
    expect(homeOf("/home/clement/code/minddy")).toBe("/home/clement");
    // Le dépôt EST la maison : le cas limite du dépôt cloné à la racine.
    expect(homeOf("/Users/clement")).toBe("/Users/clement");
  });

  it("rend null quand le dépôt vit ailleurs", () => {
    // Pas d'échec, pas de repli deviné : il n'y a alors simplement pas de `~` à
    // substituer, et `foreignPaths` continue de fonctionner sur le reste.
    expect(homeOf("/srv/code/minddy")).toBeNull();
    expect(homeOf("/vercel/sandbox/repo")).toBeNull();
  });
});

describe("foreignPaths", () => {
  it("voit ce que le shell est allé lire ailleurs", () => {
    expect(foreignPaths("cat ~/.ssh/config", REPO)).toEqual(["~/.ssh/config"]);
    expect(foreignPaths("/Users/clement/clients/acme/.env", REPO)).toEqual([
      "/Users/clement/clients/acme/.env",
    ]);
    // Le dossier personnel de QUELQU'UN D'AUTRE nomme quelqu'un tout autant.
    expect(foreignPaths("/Users/autre/Documents/notes.md", REPO)).toEqual([
      "/Users/autre/Documents/notes.md",
    ]);
    // Un point de montage : disque externe, NAS, clé USB.
    expect(foreignPaths("/Volumes/Sauvegardes/2026/impots.pdf", REPO)).toEqual([
      "/Volumes/Sauvegardes/2026/impots.pdf",
    ]);
  });

  it("ne voit rien dans le dépôt attribué", () => {
    expect(foreignPaths(`${REPO}/lib/server/agent/vm/supervisor.ts`, REPO)).toEqual([]);
    expect(foreignPaths(`error at ${REPO}/app/page.tsx:42:11`, REPO)).toEqual([]);
  });

  it("ne voit rien dans ce qui est identique sur tous les Mac", () => {
    // C'est ce qui rend la garde tenable : ces chemins sont dans la moitié des
    // traces de pile, et ils ne disent rien de personne.
    const trace =
      "at Object.<anonymous> (/opt/homebrew/lib/node_modules/npm/index.js:1:1)\n" +
      "  /usr/bin/node --version\n" +
      "  /System/Library/Frameworks\n" +
      "  ENOENT: /etc/nginx/nginx.conf";
    expect(foreignPaths(trace, REPO)).toEqual([]);
  });

  it("développe `~` avant de juger", () => {
    // Sans développement, un dépôt cloné dans la maison verrait ses propres
    // fichiers comptés comme étrangers.
    expect(foreignPaths("~/Projets/minddy/lib/x.ts", REPO)).toEqual([]);
    expect(foreignPaths("~/Projets/autre/lib/x.ts", REPO)).toEqual(["~/Projets/autre/lib/x.ts"]);
  });

  it("dédoublonne — le compte est celui des chemins, pas des occurrences", () => {
    expect(foreignPaths("~/.aws/credentials et encore ~/.aws/credentials", REPO)).toEqual([
      "~/.aws/credentials",
    ]);
  });
});

describe("scrubPaths", () => {
  it("rend le dépôt relatif et la maison anonyme", () => {
    expect(scrubPaths(`${REPO}/lib/x.ts`, REPO)).toBe("./lib/x.ts");
    expect(scrubPaths("/Users/clement/Téléchargements/x.zip", REPO)).toBe("~/Téléchargements/x.zip");
  });

  it("réécrit AUSSI ce qui est dans le dépôt — c'est le fond de l'affaire", () => {
    // `/Users/<prénom nom>` n'est pas dans les sorties suspectes, il est dans
    // toutes : une règle qui ne regarderait que ce qui sort du dépôt le
    // laisserait passer intégralement.
    const trace = `TypeError at ${REPO}/app/page.tsx:42\n  at ${REPO}/lib/x.ts:7`;
    expect(scrubPaths(trace, REPO)).toBe("TypeError at ./app/page.tsx:42\n  at ./lib/x.ts:7");
    expect(scrubPaths(trace, REPO)).not.toContain("clement");
  });

  it("laisse un chemin utilisable", () => {
    // Ce qui est réécrit est relu par le modèle au tour suivant : `./lib/x.ts`
    // depuis le dépôt et `~/…` pour le shell restent des chemins valides.
    expect(scrubPaths(`cd ${REPO} && cat ${REPO}/package.json`, REPO)).toBe(
      "cd . && cat ./package.json",
    );
  });

  it("ne touche pas à ce qui n'est pas un chemin de machine", () => {
    expect(scrubPaths("npm run typecheck → 0 erreur", REPO)).toBe("npm run typecheck → 0 erreur");
    expect(scrubPaths("/usr/bin/node", REPO)).toBe("/usr/bin/node");
  });

  it("fonctionne sans maison connue", () => {
    expect(scrubPaths("/srv/code/minddy/lib/x.ts", "/srv/code/minddy")).toBe("./lib/x.ts");
  });
});

describe("filterLocalPayload", () => {
  it("descend dans les charges imbriquées, comme la substitution des secrets", () => {
    const { payload, foreign, foreignCount } = filterLocalPayload(
      {
        name: "run_command",
        state: {
          command: `cd ${REPO} && cat ~/.ssh/config`,
          parts: [{ text: `${REPO}/lib/x.ts` }, { text: "/Users/clement/.aws/credentials" }],
        },
      },
      REPO,
    );
    expect(payload).toEqual({
      name: "run_command",
      state: {
        command: "cd . && cat ~/.ssh/config",
        parts: [{ text: "./lib/x.ts" }, { text: "~/.aws/credentials" }],
      },
    });
    expect(foreign).toBe(true);
    expect(foreignCount).toBe(2);
  });

  it("ne signale rien sur une charge qui ne parle que du dépôt", () => {
    const { foreign, foreignCount } = filterLocalPayload(
      { name: "read_file", path: `${REPO}/lib/x.ts`, preview: "export const x = 1;" },
      REPO,
    );
    expect(foreign).toBe(false);
    expect(foreignCount).toBe(0);
  });

  it("laisse passer ce qui n'est pas du texte", () => {
    const { payload } = filterLocalPayload(
      { n: 3, ok: true, nothing: null, when: undefined },
      REPO,
    );
    expect(payload).toEqual({ n: 3, ok: true, nothing: null, when: undefined });
  });
});

describe("withheldOutput", () => {
  it("dit ce qui manque, et pourquoi — au modèle autant qu'à l'humain", () => {
    const text = withheldOutput(4312, 2);
    expect(text).toContain("4312");
    expect(text).toContain("2 path(s)");
    // Le modèle a VU la sortie quand le tool a tourné : sans cette phrase, il
    // relit un trou et recommence le geste.
    expect(text).toContain("you saw the output when the tool ran");
  });
});
