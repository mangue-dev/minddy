import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-111 : ce qui décide qu'un run VOIT les maquettes est une lecture de l'index
 * OpenRouter — `architecture.input_modalities` contient-il `image`. Le reste du
 * ticket en dépend entièrement : se tromper de champ, et soit la capacité n'arrive
 * jamais, soit on envoie une image à un modèle texte (400 en plein tour).
 *
 * Les charges utiles ci-dessous sont copiées de la VRAIE réponse de
 * `https://openrouter.ai/api/v1/models` (2026-07-28) : c'est la forme qu'on parse,
 * pas celle qu'on imagine. Un seul appel réseau sert les deux capacités.
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
    // Modèle sans bloc `architecture` : l'index n'est pas homogène.
    { id: "legacy/model", context_length: 8_192 },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

/** Import FRAIS : l'index est caché au niveau module (une fois par process). */
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
    // Un seul aller-retour réseau pour les deux questions.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renvoie null hors OpenRouter et pour un modèle inconnu", async () => {
    const { getModelContextWindow } = await freshModel();
    expect(await getModelContextWindow("anthropic/claude-sonnet-5", "anthropic", "sk")).toBeNull();
    expect(await getModelContextWindow("unknown/model", "openrouter", "sk")).toBeNull();
  });
});
