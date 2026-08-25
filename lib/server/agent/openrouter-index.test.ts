import { afterEach, describe, expect, it, vi } from "vitest";

import { modelCostMultiplier } from "@/lib/model-multiplier";

vi.mock("@/lib/server/ai-provider-request", () => ({
  fetchAiProviderBytes: async (
    _provider: string,
    url: string,
    options: { headers?: Record<string, string> },
  ) => {
    const response = await fetch(url, { headers: options.headers });
    return {
      ok: response.ok,
      status: response.status,
      bytes: Buffer.from(await response.arrayBuffer()),
    };
  },
}));

/**
 * Reading the OpenRouter index — the only source of prices, hence the displayed multiplier and plan cap. What matters: that the real form
 * of `/models` (prices in CHAINS, per TOKEN) comes out in USD at
 * million tokens, and that a suffixed id does not become “of unknown price”,
 * which would make it pass under all the ceilings.
 *
 * The index is a PROCESS cache: each test reimports it new
 * (`vi.resetModules()` + dynamic `import()`), otherwise the first test
 * loaded would serve all the others.
 */

/** Faithful extract from OpenRouter's response (price per token, in chains). */
const PAYLOAD = {
  data: [
    {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      context_length: 163840,
      supported_parameters: ["tools", "reasoning"],
      architecture: { input_modalities: ["text"] },
      // The real object published by OpenRouter: the efforts come from the HEAVIEST
      // at the lightest, and `none` is the word for “do not reason”.
      reasoning: {
        mandatory: false,
        default_effort: "medium",
        supported_efforts: ["xhigh", "high", "medium", "low", "none"],
      },
      pricing: { prompt: "0.00000010", completion: "0.00000032" },
    },
    {
      id: "anthropic/claude-opus-5",
      name: "Claude Opus 5",
      context_length: 200000,
      supported_parameters: ["tools"],
      architecture: { input_modalities: ["text", "image"] },
      // The Claudes: they reason, but do not publish any enumeration.
      reasoning: { mandatory: false },
      pricing: { prompt: "0.000005", completion: "0.000025" },
    },
    {
      id: "some/embedding-model",
      name: "Embeddings",
      supported_parameters: [],
      pricing: { prompt: "0.00000002", completion: "0" },
    },
    // A referral: not a model, a meta-endpoint which chooses one.
    {
      id: "openrouter/auto",
      name: "Auto Router",
      supported_parameters: ["tools"],
      architecture: {
        tokenizer: "Router",
        input_modalities: ["text", "image"],
        output_modalities: ["text", "image"],
      },
      pricing: { prompt: "-1", completion: "-1" },
    },
    // A family ALIAS: same mechanism, but it carries a `alias_target`.
    {
      id: "~anthropic/claude-opus-latest",
      name: "Anthropic: Claude Opus Latest",
      alias_target: { slug: "anthropic/claude-opus-5" },
      supported_parameters: ["tools"],
      architecture: {
        tokenizer: "Router",
        input_modalities: ["text"],
        output_modalities: ["text"],
      },
      pricing: { prompt: "0.000005", completion: "0.000025" },
    },
    // It renders the IMAGE, and still declares `tools`.
    {
      id: "google/gemini-3-pro-image",
      name: "Gemini 3 Pro Image",
      supported_parameters: ["tools"],
      architecture: { input_modalities: ["text"], output_modalities: ["image", "text"] },
      pricing: { prompt: "0.000002", completion: "0.000012" },
    },
  ],
};

/** A new index, powered by `payload` (or failed upstream). */
async function freshIndex(payload: unknown = PAYLOAD, status = 200) {
  vi.resetModules();
  const fetchMock = vi.fn(
    async () => new Response(status === 200 ? JSON.stringify(payload) : "nope", { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { ...(await import("./openrouter-index")), fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getOpenRouterModelInfo", () => {
  it("convertit les prix par token en USD au million de tokens", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    expect(info?.pricing).toEqual({ inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.32 });
  });

  it("lit aussi la fenêtre de contexte et l'entrée image", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const flash = await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    expect(flash?.contextLength).toBe(163840);
    expect(flash?.imageInput).toBe(false);
    const opus = await getOpenRouterModelInfo("anthropic/claude-opus-5");
    expect(opus?.imageInput).toBe(true);
  });

  it("retombe sur l'id NU pour un suffixe de routage", async () => {
    // Without this fallback, pasting “:nitro” would be enough to render a “price” model
    // unknown” — therefore authorized under any ceiling.
    const { getOpenRouterModelInfo } = await freshIndex();
    const nitro = await getOpenRouterModelInfo("anthropic/claude-opus-5:nitro");
    expect(nitro?.id).toBe("anthropic/claude-opus-5");
  });

  it("rend null sur un modèle vraiment inconnu", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    expect(await getOpenRouterModelInfo("nobody/nothing")).toBeNull();
  });

  it("répond sans relire /models une fois l'index chaud", async () => {
    const { getOpenRouterModelInfo, listOpenRouterIndex, fetchMock } = await freshIndex();
    await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    await getOpenRouterModelInfo("anthropic/claude-opus-5");
    await listOpenRouterIndex();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("déduplique les demandes concurrentes", async () => {
    // When starting an invocation, the catalog, loop and cap
    // request the index in the same millisecond.
    const { getOpenRouterModelInfo, fetchMock } = await freshIndex();
    await Promise.all([
      getOpenRouterModelInfo("deepseek/deepseek-v4-flash"),
      getOpenRouterModelInfo("anthropic/claude-opus-5"),
      getOpenRouterModelInfo("nobody/nothing"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marque le tool-calling, y compris quand rien n'est déclaré", async () => {
    // An EMPTY parameter list is not a refusal: the model remains listable.
    const { getOpenRouterModelInfo } = await freshIndex();
    expect((await getOpenRouterModelInfo("some/embedding-model"))?.tools).toBe(true);
    expect((await getOpenRouterModelInfo("anthropic/claude-opus-5"))?.tools).toBe(true);
  });
});

describe("aiguillages et modalités de sortie", () => {
  it("marque comme aiguillage le routeur ET l'alias de famille", async () => {
    // Both are recognized by the “Router” tokenizer; the alias also carries
    // a `alias_target`, and one of the two signs is enough.
    const { getOpenRouterModelInfo } = await freshIndex();
    expect((await getOpenRouterModelInfo("openrouter/auto"))?.router).toBe(true);
    expect((await getOpenRouterModelInfo("~anthropic/claude-opus-latest"))?.router).toBe(true);
    expect((await getOpenRouterModelInfo("anthropic/claude-opus-5"))?.router).toBe(false);
  });

  it("distingue le texte de ce qui rend image, audio ou vidéo", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    expect((await getOpenRouterModelInfo("google/gemini-3-pro-image"))?.textOutput).toBe(false);
    expect((await getOpenRouterModelInfo("anthropic/claude-opus-5"))?.textOutput).toBe(true);
  });

  it("répute textuel un modèle qui n'annonce aucune sortie", async () => {
    // The absence of an announcement is not an admission: it should not do so
    // disappear from the picker.
    const { getOpenRouterModelInfo } = await freshIndex();
    expect((await getOpenRouterModelInfo("some/embedding-model"))?.textOutput).toBe(true);
  });

  it("garde tout de même les aiguillages dans l'index", async () => {
    // The catalog does not offer them, but a hand-pasted id must remain
    // quantifiable — otherwise “unknown price”, therefore under all ceilings.
    const { listOpenRouterIndex } = await freshIndex();
    const ids = (await listOpenRouterIndex()).map((m) => m.id);
    expect(ids).toContain("openrouter/auto");
    expect(ids).toContain("google/gemini-3-pro-image");
  });
});

describe("l'index nourrit le multiplicateur", () => {
  it("situe Opus face au défaut de minddy", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const baseline = (await getOpenRouterModelInfo("deepseek/deepseek-v4-flash"))?.pricing;
    const opus = (await getOpenRouterModelInfo("anthropic/claude-opus-5"))?.pricing;
    // (5 + 25) / 2 = 15, contre (0.1 + 0.32) / 2 = 0.21.
    expect(modelCostMultiplier(opus, baseline)).toBe(71);
  });
});

describe("index illisible", () => {
  it("ne lève pas et ne situe plus personne", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getOpenRouterModelInfo, listOpenRouterIndex } = await freshIndex(null, 500);
    // Unknown prices → null multiplier → no model refused on a
    // ignorance: it is the usage budget which remains the hard ceiling.
    await expect(listOpenRouterIndex()).resolves.toEqual([]);
    await expect(getOpenRouterModelInfo("anthropic/claude-opus-5")).resolves.toBeNull();
    spy.mockRestore();
  });
});

describe("les paliers de raisonnement publiés par le modèle", () => {
  it("ressortent du moins cher au plus cher, `none` traduit en `off`", async () => {
    // Our lists go in the other direction than OpenRouter's, and `off` says a
    // little more than their `none`: send NO reasoning fields.
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    expect(info?.reasoning).toEqual({
      efforts: ["off", "low", "medium", "high", "xhigh"],
      mandatory: false,
    });
  });

  it("un modèle qui n'énumère rien garde un objet VIDE, pas `null`", async () => {
    // The nuance carries all the selector: `null` = nothing published, empty list =
    // he reasons without saying how. Both fall back onto the landings
    // generics, but `mandatory` only makes sense in the second case.
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("anthropic/claude-opus-5");
    expect(info?.reasoning).toEqual({ efforts: [], mandatory: false });
  });

  it("un modèle sans objet `reasoning` n'en invente pas", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("some/embedding-model");
    expect(info?.reasoning).toBeNull();
  });

  it("jette un palier qu'on ne sait pas nommer plutôt que de le deviner", async () => {
    // A level that cannot be displayed should not be selected either.
    const { getOpenRouterModelInfo } = await freshIndex({
      data: [
        {
          id: "x/y",
          name: "Y",
          reasoning: { mandatory: true, supported_efforts: ["ultra", "high", "low"] },
          pricing: { prompt: "0.000001", completion: "0.000001" },
        },
      ],
    });
    const info = await getOpenRouterModelInfo("x/y");
    expect(info?.reasoning).toEqual({ efforts: ["low", "high"], mandatory: true });
  });
});
