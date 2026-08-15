import { describe, expect, it } from "vitest";

import { OPENCODE_VERSION } from "@/lib/server/agent/vm/opencode-version";
import {
  opencodeBin,
  opencodeDecision,
  opencodeInstallArgs,
  opencodeInstallNote,
  opencodeManifestPath,
  opencodeRefusalMessage,
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
  it("pose le binaire là où le harness ira le chercher", () => {
    // Deux lecteurs, un seul chemin : si celui-ci diverge, la coquille installe
    // 144 Mo à côté de ce que le harness cherche, et personne ne le dit.
    expect(opencodeBin("/data/opencode")).toBe("/data/opencode/node_modules/.bin/opencode");
    expect(opencodeManifestPath("/data/opencode")).toBe(
      "/data/opencode/node_modules/opencode-ai/package.json",
    );
    expect(opencodeManifestPath("/data/opencode/")).toBe(opencodeManifestPath("/data/opencode"));
  });

  it("épingle la version dans la commande", () => {
    expect(opencodeInstallArgs(WANTED)).toContain(`opencode-ai@${WANTED}`);
    expect(opencodeInstallArgs()).toContain(`opencode-ai@${OPENCODE_VERSION}`);
  });
});

describe("ce que l'utilisateur lit", () => {
  it("nomme l'incantation que personne ne devine", () => {
    const message = opencodeRefusalMessage("no_npm", WANTED);
    expect(message).toContain("xcode-select --install");
    expect(message).toContain(WANTED);
  });

  it("explique les dix secondes d'attente, et distingue les deux causes", () => {
    expect(opencodeInstallNote("missing", WANTED)).toMatch(/first turn/i);
    expect(opencodeInstallNote("version", WANTED)).toMatch(/pinned version changed/i);
  });
});
