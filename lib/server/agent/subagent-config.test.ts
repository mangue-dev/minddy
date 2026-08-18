import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Subagent settings (MIN-112): favorites and parallelism cap, read in
 * `app_config` to be adjustable without deployment.
 *
 * What matters here: a BROKEN setting should never kill a run. The list of
 * favorites is the prompt, not the critical data — malformed JSON falls to
 * the fallback written in code. And the model resolver should reject a made-up id WITH
 * the favorites list, rather than letting a girl take a 400 from the
 * provider, which would cost her an entire round for nothing.
 */

const { config } = vi.hoisted(() => ({ config: new Map<string, string | null>() }));

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValue: async (key: string) => config.get(key) ?? null,
}));

const {
  makeSubagentModelResolver,
  scopeSubagentModels,
  subagentRoundsLeft,
  SUBAGENT_MAX_ROUNDS,
} = await import("./subagent-config");
// The two readings of `app_config` live separately since MIN-224 (the loop imports
// `subagent-config.ts` in the microVM, and what it imports should not be able to
// reach base); this test always covers them, it takes them from where they are.
const {
  getSubagentFavorites,
  maxParallelSubagents,
  SUBAGENT_FAVORITES_CONFIG_KEY,
  SUBAGENT_MAX_PARALLEL_CONFIG_KEY,
} = await import("./subagent-app-config");

beforeEach(() => config.clear());

describe("subagentRoundsLeft", () => {
  it("rend le restant EXACT tant qu'il en reste", () => {
    expect(subagentRoundsLeft(0)).toBe(SUBAGENT_MAX_ROUNDS);
    expect(subagentRoundsLeft(undefined)).toBe(SUBAGENT_MAX_ROUNDS);
    expect(subagentRoundsLeft(SUBAGENT_MAX_ROUNDS - 1)).toBe(1);
  });

  it("tombe à ZÉRO ou moins au plafond — jamais ramené à 1", () => {
    // That's the WHOLE test. The thrower limited the girl caught to
    // `Math.max(1, MAX - already played)`: on the ceiling, she left with a round,
    // played it, the loop paused, the parent parked, the chunk stopped
    // re-queued — nineteen times, until the continuation guardrail
    // kills the round (two routine passages lost on 08/07/2026). A girl without
    // round must be CUT, with its partial ratio: zero or less is the
    // signal that says so, and setting it to 1 would destroy it.
    expect(subagentRoundsLeft(SUBAGENT_MAX_ROUNDS)).toBe(0);
    expect(subagentRoundsLeft(SUBAGENT_MAX_ROUNDS + 7)).toBeLessThan(0);
  });
});
describe("getSubagentFavorites", () => {
  it("sert le repli écrit en code, en anglais et avec un use-case par entrée", async () => {
    const favorites = await getSubagentFavorites();
    expect(favorites.length).toBeGreaterThan(0);
    for (const f of favorites) {
      expect(f.id).toMatch(/\//);
      expect(f.label.length).toBeGreaterThan(0);
      // The use-case IS what is used for the choice: a favorite without advice says nothing.
      expect(f.use_case.length).toBeGreaterThan(10);
    }
    // The picker's `hint` are in French and written for a human: they do not have
    // nothing to do in a prompt.
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
    // Without a label, the id acts as a name; `off` is not an exposed level.
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
    // The catalog can be empty: it never reads, it makes the cache expired or
    // Nothing. Refusing ALL models would remove capacity for failure
    // of the index.
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
    // Two things the model needs to understand: why an id might be missing, and
    // that it can simply omit the field.
    expect(out.error).toMatch(/cannot call tools are excluded/);
    expect(out.error).toMatch(/Omit `model`/);
  });

  it("refuse un modèle HORS PLAFOND à part, sans le dire inconnu", () => {
    // “Unknown in catalog” on a model that exists would send the agent
    // try again under another spelling, one round each time.
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
    // The hole this closes: the picker grays out Strong for a Go account, but
    // the parent agent could delegate to it — against the same quota.
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
    // Unreadable price index → no multiplier → nothing is prohibited out of
    // ignorance, exactly like the picker.
    const scope = scopeSubagentModels({
      favorites,
      catalog: { models: [{ id: "deepseek/cheap", name: "Cheap" }], maxMultiplier: 15 },
    });
    expect(scope.favorites.map((f) => f.id)).toEqual(["deepseek/cheap", "anthropic/strong"]);
    expect(scope.abovePlanIds).toEqual([]);
  });
});
