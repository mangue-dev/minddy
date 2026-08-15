import { describe, expect, it } from "vitest";

import { deviceIdForUserData, deviceLabel, normalizeUserDataPath } from "./device-id";

/**
 * MIN-293 — CE QUI DISTINGUE LA COQUILLE DE DÉV DE L'APP INSTALLÉE.
 *
 * Les deux tournent côte à côte sur le poste où on développe, avec la MÊME
 * session (les cookies sont par origine, pas par profil). L'identifiant est ce
 * qui empêche les deux de réclamer les mêmes runs, et il doit donc différer là
 * où les profils diffèrent — c'est-à-dire sur `userData`, et nulle part ailleurs.
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
    // Un slash final, un séparateur doublé : le même dossier. Une version de
    // l'app qui construirait le chemin autrement se présenterait sinon comme une
    // machine neuve, et chasserait la précédente de ses runs.
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
