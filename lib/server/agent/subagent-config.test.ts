import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Réglages des sous-agents (MIN-112) : favoris et plafond de parallélisme, lus dans
 * `app_config` pour être réglables sans déploiement.
 *
 * Ce qui compte ici : un réglage CASSÉ ne doit jamais tuer un run. La liste de
 * favoris est du prompt, pas de la donnée critique — un JSON mal formé retombe sur
 * le repli écrit en code. Et le résolveur de modèle doit refuser un id inventé AVEC
 * la liste des favoris, plutôt que de laisser une fille se prendre un 400 du
 * fournisseur, ce qui lui coûterait un round entier pour rien.
 */

const { config } = vi.hoisted(() => ({ config: new Map<string, string | null>() }));

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValue: async (key: string) => config.get(key) ?? null,
}));

const {
  chunkFitsSubagentResume,
  getSubagentFavorites,
  makeSubagentModelResolver,
  maxParallelSubagents,
  scopeSubagentModels,
  subagentRoundsLeft,
  SUBAGENT_FAVORITES_CONFIG_KEY,
  SUBAGENT_MAX_PARALLEL_CONFIG_KEY,
  SUBAGENT_MAX_ROUNDS,
  SUBAGENT_MIN_MS,
  SUBAGENT_PARENT_RESERVE_MS,
  SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS,
} = await import("./subagent-config");

beforeEach(() => config.clear());

describe("subagentRoundsLeft", () => {
  it("rend le restant EXACT tant qu'il en reste", () => {
    expect(subagentRoundsLeft(0)).toBe(SUBAGENT_MAX_ROUNDS);
    expect(subagentRoundsLeft(undefined)).toBe(SUBAGENT_MAX_ROUNDS);
    expect(subagentRoundsLeft(SUBAGENT_MAX_ROUNDS - 1)).toBe(1);
  });

  it("tombe à ZÉRO ou moins au plafond — jamais ramené à 1", () => {
    // C'est TOUT le test. Le lanceur bornait la fille reprise à
    // `Math.max(1, MAX - déjà joués)` : au plafond, elle repartait avec un round,
    // le jouait, la boucle suspendait, le parent se garait, le chunk se
    // re-queuait — dix-neuf fois, jusqu'à ce que le garde-fou des continuations
    // tue le tour (deux passages de routine perdus le 07/08/2026). Une fille sans
    // round doit être COUPÉE, avec son rapport partiel : zéro ou moins est le
    // signal qui le dit, et le ramener à 1 le détruisait.
    expect(subagentRoundsLeft(SUBAGENT_MAX_ROUNDS)).toBe(0);
    expect(subagentRoundsLeft(SUBAGENT_MAX_ROUNDS + 7)).toBeLessThan(0);
  });
});

describe("chunkFitsSubagentResume", () => {
  /** Le budget que le lanceur donne vraiment à une fille, cf. `execute.ts`. */
  const budgetFor = (softDeadlineMs: number) => softDeadlineMs - SUBAGENT_PARENT_RESERVE_MS;

  it("refuse un chunk trop court, accepte à partir de réserve + minimum", () => {
    expect(chunkFitsSubagentResume(SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS)).toBe(true);
    expect(chunkFitsSubagentResume(SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS - 1)).toBe(false);
    // Ce que rend une fenêtre de drain de 270 s : plein au premier claim, court à
    // la fin — et c'est ce cas-là, la norme, qui doit être refusé.
    expect(chunkFitsSubagentResume(245_000)).toBe(true);
    expect(chunkFitsSubagentResume(40_000)).toBe(false);
    // Le plancher de 1 s qui a créé le bug, et le budget négatif qu'il masquait.
    expect(chunkFitsSubagentResume(1_000)).toBe(false);
    expect(chunkFitsSubagentResume(0)).toBe(false);
    expect(chunkFitsSubagentResume(-50_000)).toBe(false);
  });

  it("admet EXACTEMENT ce que le `budgetGuard` de spawn_agent laisse déléguer", () => {
    // L'invariant qui tient les deux bouts (MIN-212). L'admission décide « ce chunk
    // peut-il reprendre une fille ? », `budgetGuard` décide « peut-on en lancer une
    // maintenant ? » — et les deux doivent dire la même chose du même chunk. Si
    // l'admission passait sous le compte, le chunk repartirait pour rendre une
    // seconde à sa fille : un round par chunk, chacun payant son réveil de microVM.
    expect(budgetFor(SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS)).toBe(SUBAGENT_MIN_MS);
    expect(budgetFor(SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS - 1)).toBeLessThan(SUBAGENT_MIN_MS);
  });
});

describe("getSubagentFavorites", () => {
  it("sert le repli écrit en code, en anglais et avec un use-case par entrée", async () => {
    const favorites = await getSubagentFavorites();
    expect(favorites.length).toBeGreaterThan(0);
    for (const f of favorites) {
      expect(f.id).toMatch(/\//);
      expect(f.label.length).toBeGreaterThan(0);
      // Le use-case EST ce qui sert au choix : un favori sans conseil ne dit rien.
      expect(f.use_case.length).toBeGreaterThan(10);
    }
    // Les `hint` du picker sont en français et écrits pour un humain : ils n'ont
    // rien à faire dans un prompt.
    expect(favorites.map((f) => f.use_case).join(" ")).not.toMatch(/Économique|défaut/);
  });

  it("prend la surcharge app_config", async () => {
    config.set(
      SUBAGENT_FAVORITES_CONFIG_KEY,
      JSON.stringify([
        { id: "x/y", label: "Custom", use_case: "for tests", thinking_effort: "high" },
      ]),
    );
    expect(await getSubagentFavorites()).toEqual([
      { id: "x/y", label: "Custom", use_case: "for tests", thinking_effort: "high" },
    ]);
  });

  it("retombe sur le repli plutôt que de casser le run", async () => {
    const fallback = await getSubagentFavorites();
    for (const broken of ["{ not json", '"a string"', "[]", "[{}]", '[{"label":"no id"}]']) {
      config.set(SUBAGENT_FAVORITES_CONFIG_KEY, broken);
      expect(await getSubagentFavorites()).toEqual(fallback);
    }
  });

  it("ignore les entrées cassées d'une liste par ailleurs valide", async () => {
    config.set(
      SUBAGENT_FAVORITES_CONFIG_KEY,
      JSON.stringify([{ id: "ok/one" }, { nope: true }, { id: "ok/two", thinking_effort: "off" }]),
    );
    const favorites = await getSubagentFavorites();
    expect(favorites.map((f) => f.id)).toEqual(["ok/one", "ok/two"]);
    // Sans libellé, l'id fait office de nom ; `off` n'est pas un niveau exposé.
    expect(favorites[0].label).toBe("ok/one");
    expect(favorites[1].thinking_effort).toBeUndefined();
  });
});

describe("maxParallelSubagents", () => {
  it("calcule d'après la VM, dans des bornes serrées", async () => {
    const n = await maxParallelSubagents();
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(6);
  });

  it("obéit à app_config, et refuse une valeur absurde", async () => {
    config.set(SUBAGENT_MAX_PARALLEL_CONFIG_KEY, "1");
    expect(await maxParallelSubagents()).toBe(1);
    config.set(SUBAGENT_MAX_PARALLEL_CONFIG_KEY, "999");
    expect(await maxParallelSubagents()).toBe(32);
    for (const junk of ["", "abc", "-3", "0"]) {
      config.set(SUBAGENT_MAX_PARALLEL_CONFIG_KEY, junk);
      const n = await maxParallelSubagents();
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(6);
    }
  });
});

describe("makeSubagentModelResolver", () => {
  const favorites = [
    { id: "deepseek/cheap", label: "Cheap One", use_case: "exploration" },
    { id: "anthropic/strong", label: "Strong One", use_case: "code" },
  ];
  const resolve = makeSubagentModelResolver({
    favorites,
    catalogIds: ["mistral/other", "deepseek/cheap"],
  });

  it("accepte un favori par son id, par son nom, et sans se soucier de la casse", () => {
    expect(resolve("deepseek/cheap")).toEqual({ ok: true, id: "deepseek/cheap" });
    expect(resolve("Cheap One")).toEqual({ ok: true, id: "deepseek/cheap" });
    expect(resolve("  strong one  ")).toEqual({ ok: true, id: "anthropic/strong" });
  });

  it("accepte un id du catalogue hors favoris", () => {
    expect(resolve("mistral/other")).toEqual({ ok: true, id: "mistral/other" });
  });

  it("accepte un favori absent du catalogue (un curaté est une valeur sûre)", () => {
    // Le catalogue peut être vide : il ne lève jamais, il rend le cache périmé ou
    // rien. Refuser alors TOUS les modèles retirerait la capacité pour une panne
    // d'index.
    const noCatalog = makeSubagentModelResolver({ favorites, catalogIds: [] });
    expect(noCatalog("anthropic/strong")).toEqual({ ok: true, id: "anthropic/strong" });
    expect(noCatalog("mistral/other").ok).toBe(false);
  });

  it("refuse un id inventé en LISTANT les favoris et en disant pourquoi", () => {
    const out = resolve("gpt-9-turbo-ultra");
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.error).toContain("deepseek/cheap (Cheap One)");
    expect(out.error).toContain("anthropic/strong (Strong One)");
    // Deux choses que le modèle doit comprendre : pourquoi un id peut manquer, et
    // qu'il peut simplement omettre le champ.
    expect(out.error).toMatch(/cannot call tools are excluded/);
    expect(out.error).toMatch(/Omit `model`/);
  });

  it("refuse un modèle HORS PLAFOND à part, sans le dire inconnu", () => {
    // « Inconnu du catalogue » sur un modèle qui existe enverrait l'agent le
    // retenter sous une autre orthographe, un round à chaque fois.
    const capped = makeSubagentModelResolver({
      favorites,
      catalogIds: ["deepseek/cheap"],
      abovePlanIds: ["anthropic/opus"],
      maxMultiplier: 15,
    });
    const out = capped("anthropic/opus");
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.error).toMatch(/above this account's plan ceiling/);
    expect(out.error).toContain("×15");
    expect(out.error).not.toMatch(/Unknown model/);
    expect(out.error).toMatch(/Omit `model`/);
  });
});

describe("scopeSubagentModels", () => {
  const favorites = [
    { id: "deepseek/cheap", label: "Cheap One", use_case: "exploration" },
    { id: "anthropic/strong", label: "Strong One", use_case: "code" },
  ];
  const catalog = {
    models: [
      { id: "deepseek/cheap", name: "Cheap", multiplier: 1 },
      { id: "mistral/mid", name: "Mid", multiplier: 6 },
      { id: "anthropic/strong", name: "Strong", multiplier: 29 },
    ],
  };

  it("retire du catalogue ET des favoris ce que le plan ne paye pas", () => {
    // Le trou que ça bouche : le picker grise Strong pour un compte Go, mais
    // l'agent parent pouvait déléguer dessus — sur le même quota.
    const scope = scopeSubagentModels({ favorites, catalog: { ...catalog, maxMultiplier: 15 } });
    expect(scope.allowedIds).toEqual(["deepseek/cheap", "mistral/mid"]);
    expect(scope.abovePlanIds).toEqual(["anthropic/strong"]);
    expect(scope.favorites.map((f) => f.id)).toEqual(["deepseek/cheap"]);
  });

  it("situe chaque favori retenu, pour que le parent voie ce qu'il dépense", () => {
    const scope = scopeSubagentModels({ favorites, catalog: { ...catalog, maxMultiplier: 40 } });
    expect(scope.favorites.map((f) => f.multiplier)).toEqual([1, 29]);
  });

  it("ne retire RIEN sans plafond (BYOK) : ce sont les tokens de l'utilisateur", () => {
    const scope = scopeSubagentModels({ favorites, catalog: { ...catalog, maxMultiplier: null } });
    expect(scope.abovePlanIds).toEqual([]);
    expect(scope.favorites.map((f) => f.id)).toEqual(["deepseek/cheap", "anthropic/strong"]);
  });

  it("garde les favoris que le catalogue ne situe pas", () => {
    // Index des prix illisible → aucun multiplicateur → on n'interdit rien sur
    // une ignorance, exactement comme le picker.
    const scope = scopeSubagentModels({
      favorites,
      catalog: { models: [{ id: "deepseek/cheap", name: "Cheap" }], maxMultiplier: 15 },
    });
    expect(scope.favorites.map((f) => f.id)).toEqual(["deepseek/cheap", "anthropic/strong"]);
    expect(scope.abovePlanIds).toEqual([]);
  });
});
