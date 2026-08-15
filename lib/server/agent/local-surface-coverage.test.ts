import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MIN-362 — LA MATRICE DE TEST DU CHANTIER LOCAL, exécutable.
 *
 * `vitest.config.ts` ne COLLECTE que `lib/**` : ni `app/api/**` ni
 * `desktop/src/**` ne sont exercés par les 360 fichiers de tests du dépôt. Or le
 * verrou d'admission du plan de contrôle tient dans UN fichier de `app/api/`, et
 * le lanceur du harness vivra dans `desktop/src/` — c'est-à-dire que le chantier
 * le plus sensible du dépôt atterrit exactement là où sa culture de test ne va
 * pas.
 *
 * Élargir `include` serait le geste évident et le mauvais : la suite tourne en
 * node nu, en 18 s, et `app/**` traînerait React, Next et jsdom derrière lui.
 * Le dépôt a déjà écrit les deux bonnes réponses, et ce fichier ne fait que les
 * RENDRE OBLIGATOIRES :
 *
 *  1. **un test de `lib/` peut aller chercher ce qui vit ailleurs** — en
 *     l'important ([local-exec-admission.test.ts](local-exec-admission.test.ts)
 *     poste de vraies requêtes à la route), ou en lisant sa source quand le
 *     chemin d'exécution demande une base et une microVM
 *     ([engine-wiring.test.ts](engine-wiring.test.ts) en explique la doctrine) ;
 *  2. **la décision descend dans `lib/desktop/`**, où elle a son test à côté
 *     (patron `hide-window.ts` / `hide-window.test.ts`), et la coquille de
 *     `desktop/src/` ne garde que le câblage : un `ipcMain.handle` qui appelle
 *     une fonction pure et rend sa réponse.
 *
 * Ce fichier échoue donc quand quelqu'un ajoute une surface sensible sans son
 * test — et le message dit laquelle. C'est un garde-fou de CULTURE, pas de
 * comportement : il ne remplace aucun des tests qu'il exige.
 */

const REPO = path.resolve(__dirname, "../../..");
const read = (relative: string): string => readFileSync(path.join(REPO, relative), "utf8");
const listTs = (relative: string): string[] =>
  readdirSync(path.join(REPO, relative))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .sort();

/** Tous les fichiers de test de `lib/`, à plat — c'est là qu'on cherche les preuves. */
function libTests(): Array<{ file: string; source: string }> {
  const out: Array<{ file: string; source: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(relative);
      else if (entry.name.endsWith(".test.ts")) out.push({ file: relative, source: read(relative) });
    }
  };
  walk("lib");
  return out;
}

/**
 * CE QUI VIT HORS DE `lib/**` ET DOIT QUAND MÊME ÊTRE EXERCÉ.
 *
 * Une entrée par surface, avec la RAISON — sans quoi la liste devient un
 * inventaire qu'on rallonge sans y penser. `reachedBy` est le texte qu'un test
 * de `lib/` doit contenir pour prouver qu'il va la chercher : un chemin
 * d'import, ou le chemin lu par un test structurel.
 */
const SURFACES_HORS_LIB = [
  {
    file: "app/api/agent-vm/[...path]/route.ts",
    pourquoi:
      "la DEUXIÈME VOIE D'ADMISSION du plan de contrôle (MIN-355) : c'est la seule porte " +
      "par laquelle un tour qui joue sur la machine de l'utilisateur parle à la base.",
    reachedBy: "@/app/api/agent-vm/[...path]/route",
  },
  {
    file: "app/api/desktop/download/route.ts",
    pourquoi: "le téléchargement de l'app de bureau — le seul binaire que le dépôt sert.",
    reachedBy: "@/app/api/desktop/download/route",
  },
  {
    file: "app/api/desktop/harness/route.ts",
    pourquoi:
      "le MANIFESTE du harness (MIN-293) : son empreinte est ce qui décide si la machine " +
      "forke ou refuse, et elle doit décrire les octets que la route voisine sert.",
    reachedBy: "@/app/api/desktop/harness/route",
  },
  {
    file: "app/api/desktop/harness/bundle/route.ts",
    pourquoi:
      "les OCTETS du harness — le seul code non signé par Apple que l'app de bureau exécute.",
    reachedBy: "@/app/api/desktop/harness/bundle/route",
  },
  {
    file: "app/api/desktop/local-turn/route.ts",
    pourquoi:
      "le pull et le déclencheur d'un tour local (MIN-371) : sélection bornée puis gardes dont l'ORDRE est la " +
      "garantie — un run refusé par sa nature ou par son mode de clé ne doit jamais " +
      "être claim, et le bail se monte en dernier parce qu'émettre c'est révoquer.",
    reachedBy: "@/app/api/desktop/local-turn/route",
  },
] as const;

describe("les surfaces du chantier local qui vivent hors de `lib/**`", () => {
  it("la prémisse tient : vitest ne collecte que `lib/**`", () => {
    // Si un jour `include` s'élargit, ce fichier n'a plus la même valeur — il
    // doit alors être relu, pas contourné.
    expect(read("vitest.config.ts")).toContain('include: ["lib/**/*.test.ts"]');
  });

  it("sont chacune atteintes par un test de `lib/`", () => {
    const tests = libTests();
    const orphelines = SURFACES_HORS_LIB.filter(
      (surface) => !tests.some((t) => t.source.includes(surface.reachedBy)),
    ).map((surface) => `${surface.file} — ${surface.pourquoi}`);

    expect(orphelines.join("\n"), "surface hors `lib/**` que plus aucun test ne va chercher").toBe("");
  });
});

/**
 * LA COQUILLE DE BUREAU, ET OÙ VIVENT SES DÉCISIONS.
 *
 * Un fichier de plus dans `desktop/src/` est un fichier que la suite de tests ne
 * verra jamais. La liste ci-dessous est donc fermée : y ajouter une ligne est le
 * geste par lequel on dit CE QUE ce fichier a le droit de contenir, et le module
 * pur de `lib/desktop/` qui porte ses décisions. C'est ce qui doit arriver au
 * lanceur du harness (MIN-293) : sa décision — quel dossier, quel jeton, quel
 * layout — descend dans `lib/desktop/`, et `desktop/src/` n'en garde que le
 * `utilityProcess.fork`.
 */
const COQUILLE = {
  "main.ts": "assemblage de la fenêtre et des IPC ; décide via @/lib/desktop/*",
  "preload.ts": "expose le pont de @/lib/desktop/bridge, et rien d'autre",
  "menu.ts": "le menu natif — composition d'API Electron",
  "updater.ts": "electron-updater ; les décisions sont dans @/lib/desktop/update-*",
  "hide-window.ts": "câblage de hideWindowStep (@/lib/desktop/hide-window)",
  "channel-store.ts": "lecture/écriture du fichier de canal ; parse dans @/lib/desktop/channel",
  "repo-store.ts": "lecture/écriture des attachements ; parse dans @/lib/desktop/local-repo",
  "local-repo.ts": "panneau système + rangement ; verdicts dans @/lib/desktop/local-repo",
  "run-log.ts":
    "le `fs` du journal d'un tour local et le ramassage du rapport de diagnostic ; " +
    "nommage, rotation, en-tête, substitution et forme du rapport dans @/lib/desktop/run-log",
  "launcher.ts":
    "le `utilityProcess.fork`, le `fetch` de session, le `fs` et le registre des tours vivants ; " +
    "la cadence et les projets annoncés par le pull dans @/lib/desktop/local-claim, " +
    "le contrat d'affectation et le layout dans @/lib/desktop/local-turn, l'empreinte du harness " +
    "dans @/lib/desktop/harness-bundle, la question du ⌘Q dans @/lib/desktop/quit-guard, " +
    "et ce qu'on tue dans @/lib/server/agent/vm/child-registry",
  "opencode-install.ts":
    "le `spawn` de `npm i` et la recherche dans le PATH ; faut-il installer, quelle commande " +
    "et quel refus dans @/lib/desktop/opencode-install",
  "trace.ts": "une ligne de journal, sans décision",
} as const;

describe("la coquille de `desktop/src/`", () => {
  it("ne contient que des fichiers déclarés, avec où vivent leurs décisions", () => {
    const inconnus = listTs("desktop/src").filter((f) => !(f in COQUILLE));
    expect(
      inconnus.join(", "),
      "fichier de `desktop/src/` hors de la liste : dire ici ce qu'il contient, et " +
        "descendre sa décision dans `lib/desktop/` avec son test",
    ).toBe("");
  });

  it("garde le pont fermé : un chemin de fichier ne remonte jamais de la page", () => {
    // La règle de lib/desktop/bridge.ts, vérifiée là où elle se casserait : le
    // preload ne doit accepter aucun chemin, sous peine que du code distant
    // puisse désigner `~/.ssh` en écrivant une chaîne.
    const preload = read("desktop/src/preload.ts");
    expect(preload).not.toMatch(/\b(path|filePath|dirPath|directory)\s*:\s*string/);
  });
});

/**
 * `lib/desktop/` : LE PATRON `<module>.ts` / `<module>.test.ts`.
 *
 * C'est la moitié qui rend la première tenable. Une exemption se déclare ici,
 * avec sa raison — et il n'y en a que deux.
 */
const SANS_TEST = {
  "bridge.ts": "surface de TYPES (plus `getDesktopBridge`, six lignes de garde) — rien à exercer",
  "use-update-status.ts": "hook React ; la suite tourne en node nu, sans jsdom",
} as const;

describe("les modules de `lib/desktop/`", () => {
  it("ont chacun leur test à côté", () => {
    const fichiers = listTs("lib/desktop");
    const modules = fichiers.filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".git.test.ts"));
    const nus = modules.filter((f) => {
      if (f in SANS_TEST) return false;
      const base = f.replace(/\.tsx?$/, "");
      return !fichiers.includes(`${base}.test.ts`) && !fichiers.includes(`${base}.git.test.ts`);
    });

    expect(
      nus.join(", "),
      "module de `lib/desktop/` sans test : c'est là que les décisions du bureau descendent, " +
        "et le patron est `hide-window.ts` / `hide-window.test.ts`",
    ).toBe("");
  });

  it("n'exemptent que ce qui est déclaré", () => {
    const fichiers = listTs("lib/desktop");
    const fantomes = Object.keys(SANS_TEST).filter((f) => !fichiers.includes(f));
    expect(fantomes.join(", "), "exemption qui ne désigne plus rien").toBe("");
  });
});
