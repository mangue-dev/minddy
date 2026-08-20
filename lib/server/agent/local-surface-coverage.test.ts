import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MIN-362 — THE LOCAL SITE TEST MATRIX, executable.
 *
 * `vitest.config.ts` only COLLECTS `lib/**` and oxlint plugin tests: neither
 * `app/api/**` nor `desktop/src/**` is exercised directly. The control-plane
 * admission lock now fits in ONE file under `app/api/`, and the harness
 * launcher will live in `desktop/src/` — so the repository's most sensitive
 * code lands exactly where its test culture does not reach.
 *
 * Extending `include` to the application surfaces would be the obvious move, but
 * it would be wrong: the suite runs on bare Node in 18 seconds, and `app/**`
 * would pull React, Next, and jsdom behind it. The oxlint plugin remains pure,
 * with its tests alongside its vendored code.
 * The repository has already established the two correct answers, and this file
 * only makes them MANDATORY:
 *
 * 1. **a test of `lib/` can reach code that lives elsewhere** — most importantly
 * ([local-exec-admission.test.ts](local-exec-admission.test.ts), which posts real
 * requests to the route), or by reading its source when the execution path
 * requests a base and a microVM
 * ([engine-wiring.test.ts](engine-wiring.test.ts) explains the doctrine);
 * 2. **the decision belongs in `lib/desktop/`**, where it has a neighboring test
 * (`hide-window.ts` / `hide-window.test.ts`), while the `desktop/src/` shell keeps
 * only the wiring: an `ipcMain.handle` that calls a pure function and returns
 * its response.
 *
 * So this file fails when someone adds a sensitive surface without its
 * test — and the message says which one. This is a CULTURE safeguard, not a behavior one: it does not replace any of the tests it requires.
 */

const REPO = path.resolve(__dirname, "../../..");
const read = (relative: string): string => readFileSync(path.join(REPO, relative), "utf8");
const listTs = (relative: string): string[] =>
  readdirSync(path.join(REPO, relative))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .sort();

/** All `lib/` test files, flat — this is where we look for evidence. */
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
 * WHAT LIVES OUTSIDE `lib/**` AND MUST STILL BE EXERCISED.
 *
 * One entry per surface, with the REASON — otherwise the list becomes an
 * inventory that we extend without thinking about it. `reachedBy` is the text that a test
 * of `lib/` must contain to prove that it will fetch it: an import path
 *, or the path read by a structural test.
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
  it("la prémisse tient : vitest ne collecte que les tests purs", () => {
    // If one day `include` expands, this file no longer has the same value — it
    // must then be reread, not bypassed.
    expect(read("vitest.config.ts")).toContain(
      'include: ["lib/**/*.test.ts", "tools/**/*.test.ts"]',
    );
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
 * THE DESKTOP SHELL, AND WHERE ITS DECISIONS LIVE.
 *
 * One more file in `desktop/src/` is a file that the test suite will never
 * see. The list below is therefore closed: adding a line to it is the
 * gesture by which we say WHAT this file has the right to contain, and the pure module
 * of `lib/desktop/` which makes its decisions. This is what should happen to the
 * launcher of the harness (MIN-293): its decision — which folder, which token, which
 * layout — goes down to `lib/desktop/`, and `desktop/src/` only keeps the
 * `utilityProcess.fork`.
 */
const COQUILLE = {
  "main.ts": "assemblage de la fenêtre et des IPC ; décide via @/lib/desktop/*",
  "preload.ts": "expose le pont de @/lib/desktop/bridge, et rien d'autre",
  "menu.ts": "le menu natif — composition d'API Electron",
  "updater.ts": "electron-updater ; les décisions sont dans @/lib/desktop/update-*",
  "hide-window.ts": "câblage de hideWindowStep (@/lib/desktop/hide-window)",
  "channel-store.ts": "lecture/écriture du fichier de canal ; parse dans @/lib/desktop/channel",
  "push-installation-store.ts":
    "lecture/écriture de l'identité APNs ; validation dans @/lib/desktop/push-installation",
  "repo-store.ts": "lecture/écriture des attachements ; parse dans @/lib/desktop/local-repo",
  "server-store.ts": "reads and writes the selected server; validation lives in @/lib/desktop/server-origin",
  "server-picker.ts":
    "composes the native server picker window; validation lives in @/lib/desktop/server-origin",
  "server-picker-preload.ts": "closed IPC bridge for the server picker window",
  "local-runtime.ts":
    "starts the local self-host launcher and waits for health; its contract lives in scripts/self-hosting-local.mjs",
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
    // The rule of lib/desktop/bridge.ts, checked where it would break: the
    // preload must not accept any path, otherwise remote code
    // can designate `~/.ssh` by writing a string.
    const preload = read("desktop/src/preload.ts");
    expect(preload).not.toMatch(/\b(path|filePath|dirPath|directory)\s*:\s*string/);
  });
});

/**
 * `lib/desktop/`: THE BOSS `<module>.ts` / `<module>.test.ts`.
 *
 * This is the half that makes the first half tenable. An exemption is declared here,
 * with its reason — and there are only two.
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
