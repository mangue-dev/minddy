import { describe, expect, it } from "vitest";

import {
  byokCapabilitiesForProvider,
  modelCatalogCapabilityForKey,
  providerSupportsModelKey,
} from "@/lib/model-catalog-capability";

describe("BYOK provider model capabilities", () => {
  it("keeps Anthropic limited to text models", () => {
    expect(byokCapabilitiesForProvider("anthropic")).toEqual(["text"]);
    expect(providerSupportsModelKey("anthropic", "assistant_model")).toBe(true);
    expect(providerSupportsModelKey("anthropic", "transcription_model")).toBe(false);
    expect(providerSupportsModelKey("anthropic", "feedback_embedding_model")).toBe(false);
  });

  it("exposes the specialized endpoints implemented by OpenAI and Google", () => {
    expect(byokCapabilitiesForProvider("openai")).toEqual([
      "text",
      "transcription",
      "embedding",
    ]);
    expect(byokCapabilitiesForProvider("google")).toEqual(["text", "embedding"]);
  });

  it("maps runtime model keys to their required family", () => {
    expect(modelCatalogCapabilityForKey("dictate_model")).toBe("text");
    expect(modelCatalogCapabilityForKey("transcription_model")).toBe("transcription");
    expect(modelCatalogCapabilityForKey("feedback_embedding_model")).toBe("embedding");
  });
});
