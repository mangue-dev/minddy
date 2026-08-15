import { describe, expect, it, vi } from "vitest";

import {
  discoverLocalModels,
  localModelDiscoveryUrl,
  parseDiscoveredModels,
} from "./local-models";

describe("découverte des modèles locaux", () => {
  it("emploie l'API native /api/tags d'Ollama, même si le chat passe par /v1", () => {
    expect(
      localModelDiscoveryUrl({ provider: "ollama", baseUrl: "http://127.0.0.1:11434/v1" }),
    ).toBe("http://127.0.0.1:11434/api/tags");
  });

  it("emploie /models pour un endpoint OpenAI-compatible", () => {
    expect(
      localModelDiscoveryUrl({ provider: "local_openai", baseUrl: "http://localhost:1234/v1" }),
    ).toBe("http://localhost:1234/v1/models");
  });

  it("refuse d'utiliser le pont Electron comme un proxy réseau", () => {
    expect(
      localModelDiscoveryUrl({ provider: "ollama", baseUrl: "http://192.168.1.10:11434" }),
    ).toBeNull();
    expect(
      localModelDiscoveryUrl({ provider: "local_openai", baseUrl: "https://example.com/v1" }),
    ).toBeNull();
  });

  it("lit et nettoie les deux formes de catalogue", () => {
    expect(
      parseDiscoveredModels("ollama", {
        models: [{ name: "qwen3:8b" }, { model: "nomic-embed-text" }, { name: "qwen3:8b" }],
      }),
    ).toEqual(["qwen3:8b"]);
    expect(
      parseDiscoveredModels("local_openai", {
        data: [{ id: "models/gpt-oss" }, { id: "text-embedding-3-small" }, { id: "llama-3" }],
      }),
    ).toEqual(["gpt-oss", "llama-3"]);
  });

  it("n'envoie aucune clé et ne suit jamais une redirection", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ models: [{ name: "qwen3:8b" }] }), { status: 200 }),
    ) as typeof fetch;

    await expect(
      discoverLocalModels({ provider: "ollama", baseUrl: "http://127.0.0.1:11434" }, fetchImpl),
    ).resolves.toEqual({ ok: true, models: ["qwen3:8b"] });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/tags",
      expect.objectContaining({ redirect: "error", headers: { accept: "application/json" } }),
    );
  });
});
