import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const safeFetch = vi.fn();
const safeFetchResponse = vi.fn();

vi.mock("@/lib/server/safe-fetch", () => ({ safeFetch, safeFetchResponse }));

const {
  fetchAiProvider,
  fetchAiProviderBytes,
  LocalAiProviderRequestError,
} = await import("@/lib/server/ai-provider-request");

describe("server-side AI provider requests", () => {
  beforeEach(() => {
    safeFetch.mockReset();
    safeFetchResponse.mockReset();
  });

  it.each(["local_openai", "ollama"] as const)(
    "rejects the %s provider before opening a server connection",
    (provider) => {
      expect(() => fetchAiProvider(provider, "http://127.0.0.1:11434/v1/models")).toThrow(
        LocalAiProviderRequestError,
      );
      expect(safeFetchResponse).not.toHaveBeenCalled();
    },
  );

  it("routes streaming provider calls through the redirect-validating transport", async () => {
    const response = new Response("ok");
    safeFetchResponse.mockResolvedValue(response);

    await expect(
      fetchAiProvider("generic", "https://models.example.test/v1/chat/completions", {
        method: "POST",
        body: "{}",
      }),
    ).resolves.toBe(response);

    expect(safeFetchResponse).toHaveBeenCalledWith(
      "https://models.example.test/v1/chat/completions",
      { method: "POST", body: "{}" },
    );
  });

  it("routes bounded catalogs and probes through the pinned byte client", async () => {
    const response = { ok: true, status: 200, bytes: Buffer.from("{}") };
    safeFetch.mockResolvedValue(response);

    await expect(
      fetchAiProviderBytes("anthropic", "https://api.anthropic.com/v1/models", {
        maxBytes: 1024,
      }),
    ).resolves.toBe(response);

    expect(safeFetch).toHaveBeenCalledWith("https://api.anthropic.com/v1/models", {
      maxBytes: 1024,
    });
  });
});
