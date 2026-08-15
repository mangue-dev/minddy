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
