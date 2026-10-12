import { describe, expect, it, vi } from "vitest";

import {
  discoverLocalModels,
  localModelDiscoveryUrl,
  parseDiscoveredModels,
} from "./local-models";

describe("local model discovery", () => {
  it("uses Ollama's native /api/tags even when chat uses /v1", () => {
    expect(
      localModelDiscoveryUrl({ provider: "ollama", baseUrl: "http://127.0.0.1:11434/v1" }),
    ).toBe("http://127.0.0.1:11434/api/tags");
  });

  it("uses /models for an OpenAI-compatible endpoint", () => {
    expect(
      localModelDiscoveryUrl({ provider: "local_openai", baseUrl: "http://localhost:1234/v1" }),
    ).toBe("http://localhost:1234/v1/models");
  });

  it("refuses to use the Electron bridge as a network proxy", () => {
    expect(
      localModelDiscoveryUrl({ provider: "ollama", baseUrl: "http://192.168.1.10:11434" }),
    ).toBeNull();
    expect(
      localModelDiscoveryUrl({ provider: "local_openai", baseUrl: "https://example.com/v1" }),
    ).toBeNull();
  });

  it("reads and cleans both catalog formats", () => {
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

  it("sends no key and never follows a redirect", async () => {
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

  it("cancels an oversized catalog before consuming its entire response", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600_000));
        controller.enqueue(new Uint8Array(600_000));
        // A bad local endpoint can stream indefinitely, rather than finishing.
      },
      cancel,
    });
    const fetchImpl = vi.fn(async () => new Response(body)) as typeof fetch;
    await expect(
      discoverLocalModels({ provider: "ollama", baseUrl: "http://localhost:11434" }, fetchImpl),
    ).resolves.toEqual({ ok: false, reason: "invalid_response" });
    expect(cancel).toHaveBeenCalledOnce();
  }, 4_000);

  it("decodes model identifiers split across UTF-8 stream chunks", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ data: [{ id: "model-🦙" }] }));
    const split = bytes.indexOf(0xf0) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });
    const fetchImpl = vi.fn(async () => new Response(body)) as typeof fetch;
    await expect(
      discoverLocalModels({ provider: "local_openai", baseUrl: "http://localhost:1234/v1" }, fetchImpl),
    ).resolves.toEqual({ ok: true, models: ["model-🦙"] });
  });
});
