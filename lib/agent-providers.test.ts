import { describe, expect, it } from "vitest";

import {
  getAgentProvider,
  isKnownAgentProvider,
  resolveProviderBaseUrl,
} from "./agent-providers";

describe("retired local providers (MIN-996)", () => {
  it("are no longer providers a key can resolve to", () => {
    for (const provider of ["local_openai", "ollama"]) {
      expect(isKnownAgentProvider(provider)).toBe(false);
      expect(resolveProviderBaseUrl(provider, "http://127.0.0.1:11434")).toBeNull();
    }
  });
});

describe("OpenCode BYOK providers (MIN-544)", () => {
  it("exposes the Go subscription and the Zen gateway as first-class cloud providers", () => {
    expect(getAgentProvider("opencode-go")?.baseUrl).toBe("https://opencode.ai/inference/go/openai/v1");
    expect(getAgentProvider("opencode-zen")?.baseUrl).toBe("https://opencode.ai/inference/openai/v1");
    // The public `/models` listing feeds the picker, exactly like OpenAI and Google.
    expect(getAgentProvider("opencode-go")?.listStrategy).toBe("openai");
    expect(getAgentProvider("opencode-zen")?.listStrategy).toBe("openai");
    expect(getAgentProvider("opencode-go")?.keysUrl).toBe("https://opencode.ai/auth");
  });

  it("keeps a conservative wire profile: no reasoning field, OpenAI max_tokens alias", () => {
    expect(getAgentProvider("opencode-zen")?.requestProfile)
      .toEqual({ streamUsage: true, outputTokenField: "max_tokens" });
    // Go refuses a call without a session id (MIN-979).
    expect(getAgentProvider("opencode-go")?.requestProfile)
      .toEqual({ streamUsage: true, outputTokenField: "max_tokens", sessionHeader: "x-opencode-session" });
  });

  it("defaults both gateways to the cheapest strong coder they share", () => {
    expect(getAgentProvider("opencode-go")?.defaultModel).toBe("glm-5.3-flash");
    expect(getAgentProvider("opencode-zen")?.defaultModel).toBe("glm-5.3-flash");
  });
});
