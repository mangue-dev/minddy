import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
 * MIN-111: what decides that a run SEES the mocks is a read of the index
 * OpenRouter — Does `architecture.input_modalities` contain `image`. The rest of the
 * ticket depends entirely on it: get the field wrong, and either the capacity never arrives, or we send an image to a text model (400 in full turn).
 *
 * The payloads below are copied from the REAL answer of
 * `https://openrouter.ai/api/v1/models` (2026-07-28): this is the form we parse,
 * not the one we imagine. A single network call serves both capabilities.
 */

const MODELS_PAYLOAD = {
  data: [
    {
      id: "deepseek/deepseek-v4-flash",
      context_length: 1_048_576,
      architecture: { input_modalities: ["text"] },
    },
    {
      id: "anthropic/claude-sonnet-5",
      context_length: 1_000_000,
      architecture: { input_modalities: ["text", "image", "file"] },
    },
    {
      id: "openai/gpt-5.6-luna",
      context_length: 1_050_000,
      architecture: { input_modalities: ["file", "image", "text"] },
    },
    // Model without block `architecture`: the index is not homogeneous.
    { id: "legacy/model", context_length: 8_192 },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

/** FRESH import: the index is hidden at module level (once per process). */
async function freshModel() {
  vi.resetModules();
  return await import("./model");
}

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify(MODELS_PAYLOAD), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("supportsImageInput", () => {
  it("dit vrai quand input_modalities porte `image`", async () => {
    const { supportsImageInput } = await freshModel();
    expect(await supportsImageInput("anthropic/claude-sonnet-5", "openrouter", "sk")).toBe(true);
    expect(await supportsImageInput("openai/gpt-5.6-luna", "openrouter", "sk")).toBe(true);
  });

  it("dit faux pour un modèle texte — le défaut de minddy en fait partie", async () => {
    const { supportsImageInput } = await freshModel();
    expect(await supportsImageInput("deepseek/deepseek-v4-flash", "openrouter", "sk")).toBe(false);
    expect(await supportsImageInput("legacy/model", "openrouter", "sk")).toBe(false);
  });

  it("dit faux pour un modèle absent de l'index, sans lever", async () => {
    const { supportsImageInput } = await freshModel();
    expect(await supportsImageInput("unknown/model", "openrouter", "sk")).toBe(false);
  });

  it("dit faux hors OpenRouter, SANS appeler l'index", async () => {
    const { supportsImageInput } = await freshModel();
    for (const provider of ["anthropic", "openai", "google", "generic"] as const) {
      expect(await supportsImageInput("anthropic/claude-sonnet-5", provider, "sk")).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dit faux quand l'index est injoignable (best-effort)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const { supportsImageInput } = await freshModel();
    expect(await supportsImageInput("anthropic/claude-sonnet-5", "openrouter", "sk")).toBe(false);
  });
});

describe("getModelContextWindow (inchangé, même index)", () => {
  it("lit context_length et ne recharge pas l'index pour la seconde capacité", async () => {
    const { getModelContextWindow, supportsImageInput } = await freshModel();
    expect(await getModelContextWindow("anthropic/claude-sonnet-5", "openrouter", "sk")).toBe(1_000_000);
    expect(await supportsImageInput("anthropic/claude-sonnet-5", "openrouter", "sk")).toBe(true);
    // Only one network round trip for both questions.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renvoie null hors OpenRouter et pour un modèle inconnu", async () => {
    const { getModelContextWindow } = await freshModel();
    expect(await getModelContextWindow("anthropic/claude-sonnet-5", "anthropic", "sk")).toBeNull();
    expect(await getModelContextWindow("unknown/model", "openrouter", "sk")).toBeNull();
  });
});
