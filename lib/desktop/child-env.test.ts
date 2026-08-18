import { describe, expect, it } from "vitest";

import { NOT_INHERITED, childEnv } from "./child-env";

/**
 * MIN-293 — A CHILD'S ENVIRONMENT, AND THE TRAP IT SETS.
 *
 * `utilityProcess.fork` refuses a `env` whose value is not a string, and
 * it says so without naming the key: `TypeError: Invalid value for env`. Removing a
 * variable by setting it to `undefined` — the form that works with
 * `child_process.spawn` — therefore caused the fork to fall **before** the harness had
 * started, where there is no event, checkpoint, or log.
 *
 * This test holds the only thing that matters: **we remove the key, we never put it
 * at `undefined`.**
 */

describe("childEnv", () => {
  it("ne rend QUE des chaînes — un `undefined` fait tomber le fork", () => {
    const env = childEnv({ PATH: "/usr/bin", VIDE: undefined, HOME: "/Users/c" });
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/Users/c" });
    // The key DISAPPEARS, it is not worth `undefined`.
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
    // `opencode serve` launches the tools shell: without `PATH` nor `HOME`, it does not
    // finds neither `git`, nor `node`, nor the user's config folder.
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
    // `FOO=` in shell means something different from unstated `FOO`, and
    // it is not up to this module to decide which of the two the caller wanted.
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
