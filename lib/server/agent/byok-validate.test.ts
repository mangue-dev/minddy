import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fetchAiProviderBytes = vi.fn();
vi.mock("@/lib/server/ai-provider-request", () => ({ fetchAiProviderBytes }));

const { probeByokKey } = await import("./byok-validate");

describe("BYOK provider probes", () => {
  beforeEach(() => {
    fetchAiProviderBytes.mockReset();
    fetchAiProviderBytes.mockResolvedValue({ ok: true, status: 200 });
  });

  it("shares one per-user probe budget across callers", async () => {
    const request = {
      provider: "generic" as const,
      apiKey: "sk-test",
      baseUrl: "https://provider.example.test/v1",
      rateLimitKey: "byok-probe-rate-limit-user",
    };

    for (let attempt = 0; attempt < 10; attempt++) {
      await expect(probeByokKey(request)).resolves.toBe("valid");
    }
    await expect(probeByokKey(request)).resolves.toBe("rate_limited");
    expect(fetchAiProviderBytes).toHaveBeenCalledTimes(10);
  });

  it("never probes a local provider from the server", async () => {
    await expect(
      probeByokKey({
        provider: "ollama",
        apiKey: "local-placeholder",
        baseUrl: "http://127.0.0.1:11434/v1",
        rateLimitKey: "local-provider-user",
      }),
    ).resolves.toBe("unknown");
    expect(fetchAiProviderBytes).not.toHaveBeenCalled();
  });
});
