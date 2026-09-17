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

  it("probes the OpenCode Go gateway with a one-token completion, not the public /models (MIN-544)", async () => {
    fetchAiProviderBytes.mockResolvedValue({ ok: false, status: 401 });
    await expect(
      probeByokKey({
        provider: "opencode-go",
        apiKey: "oc-bogus",
        baseUrl: "https://opencode.ai/zen/go/v1",
        rateLimitKey: "opencode-go-probe-user",
      }),
    ).resolves.toBe("invalid");
    const [, url, options] = fetchAiProviderBytes.mock.calls[0];
    expect(url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body) as {
      model: string;
      max_tokens: number;
      messages: unknown[];
    };
    expect(body.model).toBe("glm-5.3-flash");
    expect(body.max_tokens).toBe(1);
    expect(options.headers.Authorization).toBe("Bearer oc-bogus");
  });

  it("probes the OpenCode Zen gateway the same way and trusts a 200", async () => {
    fetchAiProviderBytes.mockResolvedValue({ ok: true, status: 200 });
    await expect(
      probeByokKey({
        provider: "opencode-zen",
        apiKey: "oc-live",
        baseUrl: "https://opencode.ai/zen/v1",
        rateLimitKey: "opencode-zen-probe-user",
      }),
    ).resolves.toBe("valid");
    const [, url] = fetchAiProviderBytes.mock.calls[0];
    expect(url).toBe("https://opencode.ai/zen/v1/chat/completions");
  });
});
