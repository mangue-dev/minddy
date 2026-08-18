import { describe, expect, it } from "vitest";

import { deviceIdForUserData, deviceLabel, normalizeUserDataPath } from "./device-id";

/**
 * MIN-293 — WHAT DISTINGUISHES THE DEV SHELL FROM THE INSTALLED APP.
 *
 * The two run side by side on the workstation where we are developing, with the SAME
 * session (cookies are by origin, not by profile). The identifier is this
 * which prevents both from claiming the same runs, and so it must differ there
 * where the profiles differ — that is, on `userData`, and nowhere else.
 */

const INSTALLED = "/Users/clement/Library/Application Support/minddy";
const DEV = "/Users/clement/Library/Application Support/minddy-dev";

describe("deviceIdForUserData", () => {
  it("donne deux identifiants différents à l'app installée et à la coquille de dév", () => {
    expect(deviceIdForUserData(INSTALLED)).not.toBe(deviceIdForUserData(DEV));
  });

  it("est stable d'un lancement à l'autre — rien n'est tiré au sort", () => {
    expect(deviceIdForUserData(INSTALLED)).toBe(deviceIdForUserData(INSTALLED));
  });

  it("ne change pas parce qu'un chemin a été recollé autrement", () => {
    // A final slash, a double separator: the same folder. A version of
    // the app which would construct the path otherwise would present itself as a
    // new machine, and would chase the previous one from its runs.
    const id = deviceIdForUserData(INSTALLED);
    expect(deviceIdForUserData(`${INSTALLED}/`)).toBe(id);
    expect(deviceIdForUserData(`${INSTALLED}//`)).toBe(id);
    expect(deviceIdForUserData(`/Users/clement//Library/Application Support/minddy`)).toBe(id);
    expect(deviceIdForUserData(`  ${INSTALLED}  `)).toBe(id);
  });

  it("rend 32 caractères hexadécimaux — de quoi voyager dans un corps JSON", () => {
    expect(deviceIdForUserData(INSTALLED)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("ne porte AUCUN morceau du chemin — il finit dans des journaux", () => {
    expect(deviceIdForUserData(INSTALLED)).not.toContain("clement");
    expect(deviceIdForUserData(INSTALLED)).not.toContain("minddy");
  });
});

describe("normalizeUserDataPath", () => {
  it("laisse un chemin déjà propre tel quel, en minuscules", () => {
    expect(normalizeUserDataPath("/Users/Clement/Library/minddy")).toBe(
      "/users/clement/library/minddy",
    );
  });
});

describe("deviceLabel", () => {
  it("dit quand c'est la coquille de dév — la confusion qu'on veut rendre impossible", () => {
    expect(deviceLabel({ hostname: "MacBook-Pro", packaged: false })).toBe("MacBook-Pro (dev)");
    expect(deviceLabel({ hostname: "MacBook-Pro", packaged: true })).toBe("MacBook-Pro");
  });

  it("retire le `.local` que Bonjour ajoute", () => {
    expect(deviceLabel({ hostname: "MacBook-Pro.local", packaged: true })).toBe("MacBook-Pro");
  });

  it("ne rend jamais une étiquette vide", () => {
    expect(deviceLabel({ hostname: "  ", packaged: true })).toBe("Mac");
    expect(deviceLabel({ hostname: ".local", packaged: false })).toBe("Mac (dev)");
  });
});
