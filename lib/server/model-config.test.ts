import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Résolution d'un réglage de modèle et repli de son raccourci de routage
 * (MIN-263).
 *
 * Ce qui compte : un raccourci est un réglage de CONFORT. S'il ne trouve pas de
 * provider, l'appel doit repartir sur le modèle nu — jamais éteindre la
 * fonctionnalité. Et sans raccourci, rien ne doit être rejoué : le repli n'est
 * pas un retry générique, il ferait payer deux fois chaque panne réseau.
 */

const { config } = vi.hoisted(() => ({ config: new Map<string, string | null>() }));

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: async (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, config.get(k) ?? null])),
}));

const {
  fetchOpenRouterWithSuffixFallback,
  modelConfigKeys,
  resolveCascadeFromValues,
  resolveConfiguredModel,
  withModelSuffixFallback,
} = await import("./model-config");
const { aiModelFallback } = await import("@/lib/ai-model-config");

beforeEach(() => {
  config.clear();
  vi.restoreAllMocks();
});

describe("resolveConfiguredModel", () => {
  it("retombe sur le défaut du registre, nu, quand rien n'est posé", async () => {
    const resolved = await resolveConfiguredModel("smart_fill_model");
    expect(resolved.model).toBe(aiModelFallback("smart_fill_model"));
    expect(resolved.base).toBe(aiModelFallback("smart_fill_model"));
    expect(resolved.suffix).toBeNull();
  });

  it("colle le raccourci au modèle choisi", async () => {
    config.set("smart_fill_model", "openai/gpt-5-mini");
    config.set("smart_fill_model_suffix", "nitro");
    const resolved = await resolveConfiguredModel("smart_fill_model");
    expect(resolved.model).toBe("openai/gpt-5-mini:nitro");
    expect(resolved.base).toBe("openai/gpt-5-mini");
    expect(resolved.suffix).toBe("nitro");
  });

  it("suffixe AUSSI le défaut du registre — le raccourci vit sans le modèle", async () => {
    config.set("smart_fill_model_suffix", "floor");
    const resolved = await resolveConfiguredModel("smart_fill_model");
    expect(resolved.model).toBe(`${aiModelFallback("smart_fill_model")}:floor`);
  });

  it("demande les deux lignes en une fois", () => {
    expect(modelConfigKeys("dictate_model")).toEqual(["dictate_model", "dictate_model_suffix"]);
  });
});

describe("resolveCascadeFromValues", () => {
  const KEYS = ["assistant_model", "fallback_model"];

  it("prend le suffixe de la clé qui a gagné", () => {
    const values = {
      assistant_model: "openai/gpt-5",
      assistant_model_suffix: "nitro",
      fallback_model: "deepseek/deepseek-v4-flash",
      fallback_model_suffix: "floor",
    };
    expect(resolveCascadeFromValues(KEYS, values).model).toBe("openai/gpt-5:nitro");
  });

  it("descend d'un cran quand la première clé n'est pas posée", () => {
    const values = {
      fallback_model: "deepseek/deepseek-v4-flash",
      fallback_model_suffix: "floor",
    };
    expect(resolveCascadeFromValues(KEYS, values).model).toBe("deepseek/deepseek-v4-flash:floor");
  });

  it("retombe sur le défaut de la PREMIÈRE clé quand rien n'est posé", () => {
    expect(resolveCascadeFromValues(KEYS, {}).model).toBe(aiModelFallback("assistant_model"));
  });
});

describe("withModelSuffixFallback", () => {
  it("n'appelle qu'une fois quand ça marche", async () => {
    const run = vi.fn(async (m: string) => m);
    expect(await withModelSuffixFallback("openai/gpt-5:nitro", run)).toBe("openai/gpt-5:nitro");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rejoue sur le modèle nu après une exception", async () => {
    const run = vi.fn(async (m: string) => {
      if (m.includes(":")) throw new Error("no endpoints");
      return "ok";
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await withModelSuffixFallback("openai/gpt-5:exacto", run)).toBe("ok");
    expect(run).toHaveBeenNthCalledWith(1, "openai/gpt-5:exacto");
    expect(run).toHaveBeenNthCalledWith(2, "openai/gpt-5");
  });

  it("rejoue aussi sur une valeur d'échec convenue (`ok`)", async () => {
    // `forcedToolCall` ne lève pas : il rend `null`. Sans `ok`, cet échec-là
    // passerait pour un succès et le repli ne partirait jamais.
    const run = vi.fn(async (m: string) => (m.includes(":") ? null : { fine: true }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await withModelSuffixFallback("openai/gpt-5:nitro", run, {
      ok: (v) => v !== null,
    });
    expect(out).toEqual({ fine: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("ne rejoue JAMAIS un modèle nu", async () => {
    const run = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(withModelSuffixFallback("openai/gpt-5", run)).rejects.toThrow("network down");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("ne rejoue pas une VARIANTE de modèle sur la variante payante", async () => {
    // `…:free` n'est pas un raccourci de routage : rejouer sans lui, c'est
    // changer de modèle et se mettre à payer, en silence.
    const run = vi.fn(async () => {
      throw new Error("rate limited");
    });
    await expect(withModelSuffixFallback("qwen/qwen3-coder:free", run)).rejects.toThrow(
      "rate limited",
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rend le second échec plutôt que d'insister", async () => {
    const run = vi.fn(async () => null);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      await withModelSuffixFallback("openai/gpt-5:floor", run, { ok: (v) => v !== null }),
    ).toBeNull();
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("fetchOpenRouterWithSuffixFallback", () => {
  const URL_ = "https://openrouter.ai/api/v1/chat/completions";

  /** Corps de requête minimal — seul le modèle change entre deux essais. */
  const request = (model: string) => ({ method: "POST", body: JSON.stringify({ model }) });

  function stubFetch(handler: (model: string) => { ok: boolean; status: number }) {
    return vi.spyOn(globalThis, "fetch").mockImplementation((async (
      _url: string,
      init: { body: string },
    ) => {
      const { model } = JSON.parse(init.body) as { model: string };
      return handler(model) as unknown as Response;
    }) as unknown as typeof fetch);
  }

  it("rend la réponse et le modèle du premier essai quand il passe", async () => {
    const fetchSpy = stubFetch(() => ({ ok: true, status: 200 }));
    const out = await fetchOpenRouterWithSuffixFallback(
      URL_,
      "openai/gpt-5:nitro",
      request,
      "[test]",
    );
    expect(out.model).toBe("openai/gpt-5:nitro");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejoue sur le modèle nu quand OpenRouter refuse, et le RETOURNE", async () => {
    // Le modèle rendu est ce à quoi les boucles à plusieurs rounds se collent :
    // sans lui, chaque tour repaierait une requête refusée.
    const fetchSpy = stubFetch((model) => ({ ok: !model.includes(":"), status: 404 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await fetchOpenRouterWithSuffixFallback(
      URL_,
      "openai/gpt-5:exacto",
      request,
      "[test]",
    );
    expect(out.response.ok).toBe(true);
    expect(out.model).toBe("openai/gpt-5");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("ne rejoue pas l'échec d'un modèle nu", async () => {
    const fetchSpy = stubFetch(() => ({ ok: false, status: 500 }));
    const out = await fetchOpenRouterWithSuffixFallback(URL_, "openai/gpt-5", request, "[test]");
    expect(out.response.ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("ne bascule pas une variante gratuite sur la payante", async () => {
    const fetchSpy = stubFetch(() => ({ ok: false, status: 429 }));
    const out = await fetchOpenRouterWithSuffixFallback(
      URL_,
      "qwen/qwen3-coder:free",
      request,
      "[test]",
    );
    expect(out.model).toBe("qwen/qwen3-coder:free");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
