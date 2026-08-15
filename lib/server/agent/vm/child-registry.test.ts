import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  childRegistryPath,
  forgetHarnessChild,
  killTargets,
  noteHarnessChild,
  parseChildRegistry,
  readHarnessChildren,
} from "./child-registry";

/**
 * MIN-293 — LE REGISTRE DE CE QUI SURVIT AU HARNESS.
 *
 * Le cas qu'il traite est celui où plus personne ne parle : un harness tué net
 * (⌘Q, plantage du main, `SIGKILL`) laisse derrière lui un serveur opencode qui
 * tient un port — et le tour suivant échoue sur un `listen` refusé, à un endroit
 * qui ne ressemble en rien à sa cause.
 *
 * Les tests qui comptent sont donc ceux du fichier ABÎMÉ (c'est l'ordinaire ici)
 * et ceux du tueur : un `process.kill` sur le mauvais numéro tue quelque chose de
 * la session de quelqu'un, et ça ne se rattrape pas.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "minddy-children-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("parseChildRegistry", () => {
  it("relit ce qu'on a écrit", () => {
    expect(
      parseChildRegistry({ children: [{ pid: 4242, kind: "opencode", label: "serve" }] }),
    ).toEqual([{ pid: 4242, kind: "opencode", label: "serve" }]);
  });

  it("ÉCARTE 0, 1 et les négatifs avant qu'ils atteignent le tueur", () => {
    // `0` signale tout le groupe de l'appelant, `1` est launchd, un négatif
    // signale un groupe entier. Aucun ne peut venir d'un `spawn` légitime, et
    // chacun serait catastrophique.
    for (const pid of [0, 1, -1, -4242, 1.5, "4242"]) {
      expect(parseChildRegistry({ children: [{ pid, kind: "opencode" }] })).toEqual([]);
    }
  });

  it("ignore un genre inconnu — une version future ne doit rien faire tuer ici", () => {
    expect(parseChildRegistry({ children: [{ pid: 42, kind: "sidecar" }] })).toEqual([]);
  });

  it("dédoublonne par pid", () => {
    expect(
      parseChildRegistry({
        children: [
          { pid: 42, kind: "opencode" },
          { pid: 42, kind: "background" },
        ],
      }),
    ).toHaveLength(1);
  });

  it("rend une liste vide sur tout ce qui n'a pas la forme — c'est l'ordinaire ici", () => {
    expect(parseChildRegistry(null)).toEqual([]);
    expect(parseChildRegistry("{tronqué")).toEqual([]);
    expect(parseChildRegistry({ children: "42" })).toEqual([]);
    expect(parseChildRegistry({})).toEqual([]);
  });
});

describe("le fichier sur le disque", () => {
  it("inscrit, relit, oublie", () => {
    noteHarnessChild(dir, { pid: 111, kind: "opencode", label: "serve --port 51234" });
    noteHarnessChild(dir, { pid: 222, kind: "background", label: "npm run dev" });
    expect(readHarnessChildren(dir).map((c) => c.pid)).toEqual([111, 222]);

    forgetHarnessChild(dir, 111);
    expect(readHarnessChildren(dir).map((c) => c.pid)).toEqual([222]);
  });

  it("remplace une inscription au même pid plutôt que de la doubler", () => {
    noteHarnessChild(dir, { pid: 111, kind: "opencode" });
    noteHarnessChild(dir, { pid: 111, kind: "opencode", label: "relancé" });
    expect(readHarnessChildren(dir)).toEqual([{ pid: 111, kind: "opencode", label: "relancé" }]);
  });

  it("crée le dossier au besoin — le harness inscrit avant tout le reste", () => {
    const deep = join(dir, "pas", "encore", "la");
    noteHarnessChild(deep, { pid: 333, kind: "opencode" });
    expect(readHarnessChildren(deep)).toHaveLength(1);
  });

  it("rend une liste vide sur un fichier tronqué, sans lever", () => {
    writeFileSync(childRegistryPath(dir), '{"children": [{"pid": 1', "utf8");
    expect(() => readHarnessChildren(dir)).not.toThrow();
    expect(readHarnessChildren(dir)).toEqual([]);
  });

  it("rend une liste vide quand rien n'a jamais été inscrit", () => {
    expect(readHarnessChildren(dir)).toEqual([]);
  });
});

describe("killTargets", () => {
  const children = [
    { pid: 500, kind: "opencode" as const, label: "serve" },
    { pid: 600, kind: "background" as const, label: "npm run dev" },
  ];

  it("signale un job de fond à son GROUPE, le serveur opencode à son pid", () => {
    // Un job de fond part en `setsid` : il est chef de sa propre session. Tuer
    // le seul chef laisserait le `npm run dev` qu'il a lancé, port 3000 tenu.
    expect(killTargets(children, { pid: 1 })).toEqual([
      { signalTo: -600, kind: "background", label: "npm run dev" },
      { signalTo: 500, kind: "opencode", label: "serve" },
    ]);
  });

  it("tue les jobs de fond AVANT le serveur opencode", () => {
    const order = killTargets(children, { pid: 1 }).map((t) => t.kind);
    expect(order).toEqual(["background", "opencode"]);
  });

  it("ne se tue JAMAIS lui-même, ni son parent", () => {
    // Un registre corrompu qui porterait le pid du main process ferait quitter
    // l'app en croyant faire le ménage.
    const targets = killTargets(children, { pid: 500, ppid: 600 });
    expect(targets).toEqual([]);
  });

  it("rend une liste vide sur un registre vide", () => {
    expect(killTargets([], { pid: 42 })).toEqual([]);
  });
});
