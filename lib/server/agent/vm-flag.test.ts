import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-224 — le drapeau de migration, et la seule chose qu'on lui demande : ne
 * jamais empêcher un lancement.
 *
 * Il décide quel MOTEUR joue le run — la boucle dans la fonction, ou la boucle
 * dans la microVM. Il est lu une fois, au lancement, puis gelé sur la ligne. Ce
 * qui compte ici est donc son comportement de REPLI : une clé absente, un JSON
 * cassé, une base injoignable doivent laisser le projet sur l'ancienne forme,
 * celle qui tourne depuis un an — jamais faire échouer la création du run.
 */

const { config } = vi.hoisted(() => ({ config: new Map<string, string | null>() }));

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValue: async (key: string) => {
    const value = config.get(key);
    if (value === "__throw__") throw new Error("base injoignable");
    return value ?? null;
  },
}));

const { loopInVmForProject, LOOP_IN_VM_CONFIG_KEY } = await import("./vm-flag");

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const OTHER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

beforeEach(() => config.clear());

describe("loopInVmForProject", () => {
  it("laisse tout le monde sur l'ancienne forme quand rien n'est configuré", async () => {
    expect(await loopInVmForProject(PROJECT)).toBe(false);
  });

  it("bascule le projet listé, et lui seul", async () => {
    config.set(LOOP_IN_VM_CONFIG_KEY, JSON.stringify([PROJECT]));
    expect(await loopInVmForProject(PROJECT)).toBe(true);
    // C'est TOUT le sujet du « par projet » : on bascule un dépôt à la fois.
    expect(await loopInVmForProject(OTHER)).toBe(false);
  });

  it("accepte le joker, pour le jour où il ne restera qu'à retirer le drapeau", async () => {
    config.set(LOOP_IN_VM_CONFIG_KEY, JSON.stringify(["*"]));
    expect(await loopInVmForProject(OTHER)).toBe(true);
  });

  it("tolère les espaces autour d'un id collé à la main dans /admin", async () => {
    config.set(LOOP_IN_VM_CONFIG_KEY, JSON.stringify([`  ${PROJECT}  `]));
    expect(await loopInVmForProject(PROJECT)).toBe(true);
  });

  it("retombe sur l'ancienne forme sur tout ce qui n'est pas une liste d'ids", async () => {
    // Un drapeau de migration illisible ne doit pas décider d'un moteur : il doit
    // s'effacer. Le pire cas acceptable est « rien n'a basculé », jamais « le
    // lancement échoue » ni « tout a basculé par accident ».
    for (const broken of ["", "   ", "{ not json", '"une chaîne"', "42", "{}", "[]", "[1, 2]"]) {
      config.set(LOOP_IN_VM_CONFIG_KEY, broken);
      expect(await loopInVmForProject(PROJECT), `sur ${JSON.stringify(broken)}`).toBe(false);
    }
  });

  it("ne LÈVE pas quand la base ne répond pas", async () => {
    config.set(LOOP_IN_VM_CONFIG_KEY, "__throw__");
    await expect(loopInVmForProject(PROJECT)).resolves.toBe(false);
  });
});
