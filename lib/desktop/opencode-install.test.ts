import { describe, expect, it } from "vitest";

import {
  MINDDY_NODE_EXEC_ENV,
  MINDDY_NPM_CLI_ENV,
  OPENCODE_VERSION,
  opencodeNpmProgram,
} from "@/lib/server/agent/vm/opencode-version";
import {
  OPENCODE_INSTALL_MANIFEST,
  opencodeInstallArgs,
  opencodeInstallManifestPath,
  opencodePackageManifestPath,
  opencodePluginManifestPath,
} from "@/lib/server/agent/vm/opencode-version";
import {
  opencodeBin,
  opencodeDecision,
  opencodeInstallNote,
  opencodeRefusalMessage,
  electronToolShim,
  localRuntimePath,
  npmInvocation,
  readOpencodeManifestVersion,
} from "./opencode-install";

/**
 * MIN-293 — LE PRÉ-VOL D'OPENCODE.
 *
 * Deux choses sont tenues ici. La première est l'ÉPINGLE : un test d'existence
 * seul verrait le binaire d'hier et le trouverait très bien, et tous les tours
 * tourneraient sur l'ancien moteur pendant que le dépôt jure le contraire. La
 * seconde est le cas que l'audit n'avait pas nommé — **Electron embarque Node,
 * pas npm** : sur un Mac sans chaîne d'outils, l'installation ne peut pas avoir
 * lieu, et ça doit se dire AVANT le fork, où il y a encore un journal.
 */

const WANTED = "1.18.16";

function facts(over: Partial<Parameters<typeof opencodeDecision>[0]> = {}) {
  return {
    installedVersion: WANTED,
    pluginVersion: WANTED,
    binaryPresent: true,
    npmAvailable: true,
    ...over,
  };
}

describe("opencodeDecision", () => {
  it("ne fait rien quand la bonne version est là", () => {
    expect(opencodeDecision(facts(), WANTED)).toEqual({ action: "ready" });
  });

  it("installe sur une machine neuve", () => {
    expect(
      opencodeDecision(facts({ installedVersion: null, binaryPresent: false }), WANTED),
    ).toEqual({ action: "install", why: "missing" });
  });

  it("RÉINSTALLE quand l'épingle a bougé, même si le binaire est là", () => {
    // Le cas qui coûterait cher en silence : le carnet de mesures du dépôt porte
    // sur CE binaire, pas sur une API publique.
    expect(opencodeDecision(facts({ installedVersion: "1.17.0" }), WANTED)).toEqual({
      action: "install",
      why: "version",
    });
  });

  it("réinstalle quand le manifeste dit la bonne version mais que le binaire manque", () => {
    expect(opencodeDecision(facts({ binaryPresent: false }), WANTED)).toEqual({
      action: "install",
      why: "missing",
    });
  });

  it("installe le runtime des tools une fois s'il manque à une ancienne installation", () => {
    expect(opencodeDecision(facts({ pluginVersion: null }), WANTED)).toEqual({
      action: "install",
      why: "missing",
    });
  });

  it("REFUSE quand il n'y a rien à installer avec — Electron n'embarque pas npm", () => {
    expect(
      opencodeDecision(
        facts({ installedVersion: null, binaryPresent: false, npmAvailable: false }),
        WANTED,
      ),
    ).toEqual({ action: "refuse", reason: "no_npm" });
  });

  it("ne refuse PAS pour un npm absent quand tout est déjà installé", () => {
    // Une machine sans chaîne d'outils qui a reçu opencode une fois continue de
    // tourner : le refus porte sur l'installation, pas sur l'exécution.
    expect(opencodeDecision(facts({ npmAvailable: false }), WANTED)).toEqual({ action: "ready" });
  });

  it("prend l'épingle du dépôt par défaut", () => {
    expect(opencodeDecision(facts({ installedVersion: OPENCODE_VERSION }))).toEqual({
      action: "ready",
    });
  });
});

describe("readOpencodeManifestVersion", () => {
  it("lit la version du paquet", () => {
    expect(readOpencodeManifestVersion('{"name":"opencode-ai","version":"1.18.16"}')).toBe(
      "1.18.16",
    );
  });

  it("rend null sur un manifeste tronqué, vide ou sans version", () => {
    for (const raw of ['{"name":"opencode-ai"', "", "{}", '{"version":42}', '{"version":"  "}']) {
      expect(readOpencodeManifestVersion(raw)).toBeNull();
    }
  });
});

describe("les chemins et la commande", () => {
  it("répare le PATH minimal d'une app lancée depuis Finder sans perdre le PATH existant", () => {
    expect(localRuntimePath("/usr/bin:/bin", ["/Users/c/.nvm/versions/node/v24/bin"]))
      .toBe(
        "/usr/bin:/bin:/Users/c/.nvm/versions/node/v24/bin:/opt/homebrew/bin:" +
          "/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/sbin",
      );
  });

  it("fabrique des shims Node/npm qui supportent les espaces et apostrophes", () => {
    expect(electronToolShim("/Applications/Minddy's App.app/minddy", ["/app asar/npm-cli.js"]))
      .toBe(
        "#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec " +
          "'/Applications/Minddy'\\''s App.app/minddy' '/app asar/npm-cli.js' \"$@\"\n",
      );
  });

  it("préfère le npm embarqué et le fait exécuter par le Node d'Electron", () => {
    expect(
      npmInvocation({
        bundledCli: "/Applications/minddy.app/Contents/Resources/app.asar/node_modules/npm/bin/npm-cli.js",
        electronExecutable: "/Applications/minddy.app/Contents/MacOS/minddy",
        systemNpm: "/usr/local/bin/npm",
      }),
    ).toMatchObject({
      executable: "/Applications/minddy.app/Contents/MacOS/minddy",
      source: "bundled",
      extraEnv: { ELECTRON_RUN_AS_NODE: "1" },
    });
  });

  it("retombe sur le npm système quand l'ancien bundle n'en porte pas", () => {
    expect(
      npmInvocation({ bundledCli: null, electronExecutable: "/minddy", systemNpm: "/usr/local/bin/npm" }),
    ).toEqual({ executable: "/usr/local/bin/npm", argsPrefix: [], extraEnv: {}, source: "system" });
  });

  it("donne au harness le même npm embarqué pour son contrôle autoritaire", () => {
    expect(
      opencodeNpmProgram({
        [MINDDY_NPM_CLI_ENV]: "/app.asar/node_modules/npm/bin/npm-cli.js",
        [MINDDY_NODE_EXEC_ENV]: "/Applications/minddy.app/Contents/MacOS/minddy",
      }),
    ).toEqual({
      executable: "/Applications/minddy.app/Contents/MacOS/minddy",
      argsPrefix: ["/app.asar/node_modules/npm/bin/npm-cli.js"],
      electronRunAsNode: true,
    });
    expect(opencodeNpmProgram({})).toEqual({
      executable: "npm",
      argsPrefix: [],
      electronRunAsNode: false,
    });
  });

  it("pose le binaire là où le harness ira le chercher", () => {
    // Deux lecteurs, un seul chemin : si celui-ci diverge, la coquille installe
    // 144 Mo à côté de ce que le harness cherche, et personne ne le dit.
    expect(opencodeBin("/data/opencode")).toBe("/data/opencode/node_modules/.bin/opencode");
    expect(opencodePackageManifestPath("/data/opencode")).toBe(
      "/data/opencode/node_modules/opencode-ai/package.json",
    );
    expect(opencodePackageManifestPath("/data/opencode/")).toBe(
      opencodePackageManifestPath("/data/opencode"),
    );
    expect(opencodePluginManifestPath("/data/opencode")).toBe(
      "/data/opencode/node_modules/@opencode-ai/plugin/package.json",
    );
  });

  it("épingle la version dans la commande", () => {
    expect(opencodeInstallArgs("/data/opencode", WANTED)).toContain(`opencode-ai@${WANTED}`);
    expect(opencodeInstallArgs("/data/opencode")).toContain(`opencode-ai@${OPENCODE_VERSION}`);
    expect(opencodeInstallArgs("/data/opencode", WANTED)).toContain(
      `@opencode-ai/plugin@${WANTED}`,
    );
  });

  /**
   * ⚠ **LE DÉFAUT QUI A COÛTÉ UN TEST EN VRAI, ET 144 Mo DANS UN HOME.**
   *
   * `npm install` avec un `cwd` sur un dossier sans `package.json` **remonte
   * l'arborescence** jusqu'au premier qu'il trouve et installe dedans, en rendant
   * **0**. Mesuré : parti de `~/Library/Application Support/minddy-dev/opencode`,
   * npm est allé jusqu'à `/Users/<moi>/package.json`, a posé 144 Mo dans
   * `~/node_modules` et s'est ajouté aux dépendances du home. Le dossier
   * d'installation est resté vide, et le harness a attendu un serveur qui
   * n'existerait jamais.
   *
   * Dans la microVM ça marchait par CHANCE : `/vercel/oc` n'a aucun ancêtre qui
   * porte un `package.json`. L'hypothèse n'était écrite nulle part.
   */
  it("dit à npm OÙ installer, au lieu de le laisser chercher", () => {
    const args = opencodeInstallArgs("/data/opencode");
    expect(args).toContain("--prefix");
    expect(args[args.indexOf("--prefix") + 1]).toBe("/data/opencode");
  });

  it("pose un `package.json` dans le dossier — la porte fermée une seconde fois", () => {
    expect(opencodeInstallManifestPath("/data/opencode")).toBe("/data/opencode/package.json");
    const manifest = JSON.parse(OPENCODE_INSTALL_MANIFEST) as Record<string, unknown>;
    expect(manifest.private).toBe(true);
    // Un humain qui tombe sur ce dossier dans `~/Library/Application Support/`
    // doit comprendre d'où il vient sans rien ouvrir d'autre.
    expect(String(manifest.description)).toMatch(/minddy/i);
  });
});

describe("ce que l'utilisateur lit", () => {
  it("demande de réparer l'app quand son bootstrap et le repli système manquent", () => {
    const message = opencodeRefusalMessage("no_npm", WANTED);
    expect(message).toMatch(/reinstall or update minddy/i);
    expect(message).toContain(WANTED);
  });

  it("explique les dix secondes d'attente, et distingue les deux causes", () => {
    expect(opencodeInstallNote("missing", WANTED)).toMatch(/first turn/i);
    expect(opencodeInstallNote("version", WANTED)).toMatch(/pinned version changed/i);
  });
});
