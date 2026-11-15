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
 * Reading the OpenRouter index, the only source of prices and therefore of the
 * displayed multiplier and the plan cap. What matters: the real shape of
 * `/models` (prices as STRINGS, per TOKEN) comes out in USD per million
 * tokens, and a suffixed id does not become “unknown price”, which would let
 * it slip under every ceiling.
 *
 * The index is a PROCESS cache: each test reimports a fresh copy
 * (`vi.resetModules()` + dynamic `import()`), otherwise the first test to load
 * it would serve all the others.
 */

/** Faithful excerpt of OpenRouter's response (price per token, as strings). */
const PAYLOAD = {
  data: [
    {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      context_length: 163840,
      supported_parameters: ["tools", "reasoning"],
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      // The real object OpenRouter publishes: efforts run from the HEAVIEST to
      // the lightest, and `none` is its word for “do not reason”.
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
      architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
      // Claude models reason but publish no enumeration.
      reasoning: { mandatory: false },
      pricing: { prompt: "0.000005", completion: "0.000025" },
    },
    {
      id: "some/embedding-model",
      name: "Embeddings",
      supported_parameters: [],
      architecture: { input_modalities: ["text"], output_modalities: ["embeddings"] },
      pricing: { prompt: "0.00000002", completion: "0" },
    },
    {
      id: "openai/whisper-large-v3",
      name: "Whisper Large V3",
      supported_parameters: [],
      architecture: { input_modalities: ["audio"], output_modalities: ["transcription"] },
      pricing: { prompt: "0", completion: "0" },
    },
    {
      id: "some/unknown-output",
      name: "Unknown Output",
      supported_parameters: [],
      pricing: { prompt: "0.00000002", completion: "0" },
    },
    // A router: not a model, but a meta-endpoint that picks one.
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
    // A family ALIAS: same mechanism, but it carries an `alias_target`.
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
    // It outputs an IMAGE, yet still declares `tools`.
    {
      id: "google/gemini-3-pro-image",
      name: "Gemini 3 Pro Image",
      supported_parameters: ["tools"],
      architecture: { input_modalities: ["text"], output_modalities: ["image", "text"] },
      pricing: { prompt: "0.000002", completion: "0.000012" },
    },
  ],
};

/** A fresh index, fed by `payload` (or by a failing upstream). */
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

describe("cached model capabilities", () => {
  it("reads available capabilities without fetching and preserves exact variants", async () => {
    const { getCachedOpenRouterModelInfo, loadOpenRouterIndex, fetchMock } = await freshIndex({
      data: [
        { id: "vendor/model", architecture: { input_modalities: ["text", "image", "file"] },
          pricing: { input_cache_read: "0.000001" } },
        { id: "vendor/model:free" },
      ],
    });
    expect(getCachedOpenRouterModelInfo("vendor/model")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await loadOpenRouterIndex();
    expect(getCachedOpenRouterModelInfo("vendor/model:nitro")).toMatchObject({
      inputModalities: ["text", "image", "file"], promptCaching: true, cachePricing: null,
    });
    expect(getCachedOpenRouterModelInfo("vendor/model:free")).toMatchObject({
      inputModalities: ["text"], promptCaching: false,
    });
    expect(getCachedOpenRouterModelInfo("missing/model")).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("getOpenRouterModelInfo", () => {
  it("converts per-token prices to USD per million tokens", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    expect(info?.pricing).toEqual({ inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.32 });
  });

  it("also reads the context window and image input", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const flash = await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    expect(flash?.contextLength).toBe(163840);
    expect(flash?.imageInput).toBe(false);
    const opus = await getOpenRouterModelInfo("anthropic/claude-opus-5");
    expect(opus?.imageInput).toBe(true);
  });

  it("falls back to the BARE id for a routing suffix", async () => {
    // Without this fallback, appending “:nitro” would be enough to make a model
    // “unknown price”, and therefore allowed under any ceiling.
    const { getOpenRouterModelInfo } = await freshIndex();
    const nitro = await getOpenRouterModelInfo("anthropic/claude-opus-5:nitro");
    expect(nitro?.id).toBe("anthropic/claude-opus-5");
  });

  it("returns null for a truly unknown model", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    expect(await getOpenRouterModelInfo("nobody/nothing")).toBeNull();
  });

  it("answers without refetching /models once the index is warm", async () => {
    const { getOpenRouterModelInfo, listOpenRouterIndex, fetchMock } = await freshIndex();
    await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    await getOpenRouterModelInfo("anthropic/claude-opus-5");
    await listOpenRouterIndex();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requests every output modality from OpenRouter", async () => {
    const { listOpenRouterIndex, fetchMock } = await freshIndex();
    await listOpenRouterIndex();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models?output_modalities=all",
      expect.any(Object),
    );
  });

  it("deduplicates concurrent requests", async () => {
    // When an invocation starts, the catalog, the loop and the cap all
    // request the index within the same millisecond.
    const { getOpenRouterModelInfo, fetchMock } = await freshIndex();
    await Promise.all([
      getOpenRouterModelInfo("deepseek/deepseek-v4-flash"),
      getOpenRouterModelInfo("anthropic/claude-opus-5"),
      getOpenRouterModelInfo("nobody/nothing"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("flags tool calling, even when nothing is declared", async () => {
    // An EMPTY parameter list is not a refusal: the model stays listable.
    const { getOpenRouterModelInfo } = await freshIndex();
    expect((await getOpenRouterModelInfo("some/embedding-model"))?.tools).toBe(true);
    expect((await getOpenRouterModelInfo("anthropic/claude-opus-5"))?.tools).toBe(true);
  });
});

describe("routers and output modalities", () => {
  it("flags both the router AND the family alias as routers", async () => {
    // Both are recognized by the “Router” tokenizer; the alias also carries an
    // `alias_target`, and either sign is enough.
    const { getOpenRouterModelInfo } = await freshIndex();
    expect((await getOpenRouterModelInfo("openrouter/auto"))?.router).toBe(true);
    expect((await getOpenRouterModelInfo("~anthropic/claude-opus-latest"))?.router).toBe(true);
    expect((await getOpenRouterModelInfo("anthropic/claude-opus-5"))?.router).toBe(false);
  });

  it("tells text output apart from image, audio or video output", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    expect((await getOpenRouterModelInfo("google/gemini-3-pro-image"))?.textOutput).toBe(false);
    expect((await getOpenRouterModelInfo("anthropic/claude-opus-5"))?.textOutput).toBe(true);
  });

  it("treats a model with no declared output as textual", async () => {
    // A missing declaration is not a confession: it must not make the model
    // disappear from the picker.
    const { getOpenRouterModelInfo } = await freshIndex();
    expect((await getOpenRouterModelInfo("some/unknown-output"))?.textOutput).toBe(true);
  });

  it("preserves transcription and embedding output modalities", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    expect((await getOpenRouterModelInfo("some/embedding-model"))?.outputModalities).toEqual([
      "embeddings",
    ]);
    expect((await getOpenRouterModelInfo("openai/whisper-large-v3"))?.outputModalities).toEqual([
      "transcription",
    ]);
  });

  it("still keeps routers in the index", async () => {
    // The catalog does not offer them, but a hand-pasted id must stay
    // priceable; otherwise it is “unknown price”, and so under every ceiling.
    const { listOpenRouterIndex } = await freshIndex();
    const ids = (await listOpenRouterIndex()).map((m) => m.id);
    expect(ids).toContain("openrouter/auto");
    expect(ids).toContain("google/gemini-3-pro-image");
  });
});

describe("the index feeds the multiplier", () => {
  it("rates Opus against minddy's default", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const baseline = (await getOpenRouterModelInfo("deepseek/deepseek-v4-flash"))?.pricing;
    const opus = (await getOpenRouterModelInfo("anthropic/claude-opus-5"))?.pricing;
    // (5 + 25) / 2 = 15, versus (0.1 + 0.32) / 2 = 0.21.
    expect(modelCostMultiplier(opus, baseline)).toBe(71);
  });
});

describe("unreadable index", () => {
  it("does not throw and rates no model", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getOpenRouterModelInfo, listOpenRouterIndex } = await freshIndex(null, 500);
    // Unknown prices → null multiplier → no model is refused out of
    // ignorance: the usage budget remains the hard ceiling.
    await expect(listOpenRouterIndex()).resolves.toEqual([]);
    await expect(getOpenRouterModelInfo("anthropic/claude-opus-5")).resolves.toBeNull();
    spy.mockRestore();
  });
});

describe("reasoning levels published by the model", () => {
  it("come out from cheapest to most expensive, with `none` mapped to `off`", async () => {
    // Our lists run the opposite way from OpenRouter's, and `off` means a
    // little more than their `none`: send NO reasoning field at all.
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    expect(info?.reasoning).toEqual({
      efforts: ["off", "low", "medium", "high", "xhigh"],
      mandatory: false,
    });
  });

  it("a model that enumerates nothing keeps an EMPTY object, not `null`", async () => {
    // The whole selector rests on this nuance: `null` = nothing published, an
    // empty list = it reasons without saying how. Both fall back to the generic
    // levels, but `mandatory` only makes sense in the second case.
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("anthropic/claude-opus-5");
    expect(info?.reasoning).toEqual({ efforts: [], mandatory: false });
  });

  it("a model without a `reasoning` object does not get one invented", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("some/embedding-model");
    expect(info?.reasoning).toBeNull();
  });

  it("drops a level it cannot name rather than guessing it", async () => {
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
