import { describe, expect, it } from "vitest";

import {
  getAgentProvider,
  isLocalAgentProvider,
  resolveProviderBaseUrl,
} from "./agent-providers";

describe("providers BYOK locaux", () => {
  it("déclare OpenAI-compatible et Ollama comme locaux, jamais catalogués depuis le cloud", () => {
    expect(isLocalAgentProvider("local_openai")).toBe(true);
    expect(isLocalAgentProvider("ollama")).toBe(true);
    expect(getAgentProvider("local_openai")?.listStrategy).toBe("none");
    expect(getAgentProvider("ollama")?.listStrategy).toBe("none");
    expect(isLocalAgentProvider("generic")).toBe(false);
  });

  it("complète l'URL racine d'Ollama avec son API OpenAI-compatible", () => {
    expect(resolveProviderBaseUrl("ollama", "http://127.0.0.1:11434")).toBe(
      "http://127.0.0.1:11434/v1",
    );
    expect(resolveProviderBaseUrl("ollama", "http://127.0.0.1:11434/v1/")).toBe(
      "http://127.0.0.1:11434/v1",
    );
  });

  it("propose les URL d'installation locales les plus courantes", () => {
    expect(getAgentProvider("ollama")?.localDefaultBaseUrl).toBe("http://127.0.0.1:11434");
    expect(getAgentProvider("local_openai")?.localDefaultBaseUrl).toBe(
      "http://127.0.0.1:1234/v1",
    );
  });
});

describe("OpenCode BYOK providers (MIN-544)", () => {
  it("exposes the Go subscription and the Zen gateway as first-class cloud providers", () => {
    expect(getAgentProvider("opencode-go")?.baseUrl).toBe("https://opencode.ai/zen/go/v1");
    expect(getAgentProvider("opencode-zen")?.baseUrl).toBe("https://opencode.ai/zen/v1");
    // The public `/models` listing feeds the picker, exactly like OpenAI and Google.
    expect(getAgentProvider("opencode-go")?.listStrategy).toBe("openai");
    expect(getAgentProvider("opencode-zen")?.listStrategy).toBe("openai");
    expect(isLocalAgentProvider("opencode-go")).toBe(false);
    expect(isLocalAgentProvider("opencode-zen")).toBe(false);
    expect(getAgentProvider("opencode-go")?.keysUrl).toBe("https://opencode.ai/auth");
  });

  it("keeps a conservative wire profile: no reasoning field, OpenAI max_tokens alias", () => {
    const profile = getAgentProvider("opencode-go")?.requestProfile;
    expect(profile).toEqual({ streamUsage: true, outputTokenField: "max_tokens" });
    expect(getAgentProvider("opencode-zen")?.requestProfile).toEqual(profile);
  });

  it("defaults both gateways to the cheapest strong coder they share", () => {
    expect(getAgentProvider("opencode-go")?.defaultModel).toBe("glm-5.3-flash");
    expect(getAgentProvider("opencode-zen")?.defaultModel).toBe("glm-5.3-flash");
  });
});
