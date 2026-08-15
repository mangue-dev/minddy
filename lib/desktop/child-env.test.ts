import { describe, expect, it } from "vitest";

import { NOT_INHERITED, childEnv } from "./child-env";

/**
 * MIN-293 — L'ENVIRONNEMENT D'UN ENFANT, ET LE PIÈGE QU'IL FERME.
 *
 * `utilityProcess.fork` refuse un `env` dont une valeur n'est pas une chaîne, et
 * il le dit sans nommer la clé : `TypeError: Invalid value for env`. Retirer une
 * variable en la mettant à `undefined` — la forme qui marche avec
 * `child_process.spawn` — faisait donc tomber le fork **avant** que le harness ait
 * démarré, là où il n'y a ni event, ni checkpoint, ni journal.
 *
 * Ce test tient la seule chose qui compte : **on retire la clé, on ne la met
 * jamais à `undefined`.**
 */

describe("childEnv", () => {
  it("ne rend QUE des chaînes — un `undefined` fait tomber le fork", () => {
    const env = childEnv({ PATH: "/usr/bin", VIDE: undefined, HOME: "/Users/c" });
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/Users/c" });
    // La clé DISPARAÎT, elle ne vaut pas `undefined`.
    expect("VIDE" in env).toBe(false);
    for (const value of Object.values(env)) expect(typeof value).toBe("string");
  });

  it("retire ce qu'un enfant n'hérite pas", () => {
    const env = childEnv({
      PATH: "/usr/bin",
      ELECTRON_RUN_AS_NODE: "1",
      NODE_OPTIONS: "--max-http-header-size=32768",
    });
    expect(env).toEqual({ PATH: "/usr/bin" });
  });

  it("laisse passer tout le reste — le harness a besoin d'un PATH et d'un HOME", () => {
    // `opencode serve` lance le shell des tools : sans `PATH` ni `HOME`, il ne
    // trouve ni `git`, ni `node`, ni le dossier de config de l'utilisateur.
    const env = childEnv({ PATH: "/usr/bin", HOME: "/Users/c", LANG: "fr_FR.UTF-8" });
    expect(Object.keys(env).sort()).toEqual(["HOME", "LANG", "PATH"]);
  });

  it("accepte une variable de plus à retirer, sans pouvoir réintroduire les autres", () => {
    const env = childEnv(
      { PATH: "/usr/bin", SECRET: "x", ELECTRON_RUN_AS_NODE: "1" },
      ["SECRET"],
    );
    expect(env).toEqual({ PATH: "/usr/bin" });
  });

  it("garde une chaîne VIDE — c'est une valeur, pas une absence", () => {
    // `FOO=` en shell veut dire quelque chose de différent de `FOO` non posée, et
    // ce n'est pas à ce module de trancher lequel des deux l'appelant voulait.
    expect(childEnv({ FOO: "" })).toEqual({ FOO: "" });
  });

  it("rend un objet vide sur un environnement vide", () => {
    expect(childEnv({})).toEqual({});
  });

  it("déclare ce qu'il retire, pour que ça se relise", () => {
    expect(NOT_INHERITED).toContain("ELECTRON_RUN_AS_NODE");
    expect(NOT_INHERITED).toContain("NODE_OPTIONS");
  });
});
