import { describe, expect, it } from "vitest";

import {
  AI_SURFACE_DEFINITIONS,
  AI_SURFACES,
  BYOK_MODEL_KEYS,
  byokFeatureDefaultModelKey,
  parseByokFeatureModels,
  surfaceForModelKey,
} from "@/lib/ai-surfaces";

describe("AI surfaces", () => {
  it("defines every surface once, each serving at least one call type", () => {
    expect(AI_SURFACE_DEFINITIONS.map((definition) => definition.id)).toEqual([...AI_SURFACES]);
    for (const definition of AI_SURFACE_DEFINITIONS) expect(definition.modelKeys.length).toBeGreaterThan(0);
  });

  it("gives every call type exactly one surface", () => {
    for (const modelKey of BYOK_MODEL_KEYS) {
      const owners = AI_SURFACE_DEFINITIONS.filter((definition) => definition.modelKeys.includes(modelKey));
      expect(owners, modelKey).toHaveLength(1);
      expect(surfaceForModelKey(modelKey)).toBe(owners[0]!.id);
    }
  });

  it("drops blank models and rejects unknown keys", () => {
    expect(
      parseByokFeatureModels({ assistant_model: "  claude-sonnet-5  ", brief_model: " " }),
    ).toEqual({ assistant_model: "claude-sonnet-5" });
    expect(parseByokFeatureModels({ mystery_model: "x" })).toBeNull();
  });

  it("drops a retired triage override when an older client saves its other models", () => {
    expect(parseByokFeatureModels({ smart_triage_model: "old-model", assistant_model: "current-model" }))
      .toEqual({ assistant_model: "current-model" });
  });

  it("maps each model to its surface and admin default key", () => {
    expect(surfaceForModelKey("smart_fill_model")).toBe("automations");
    expect(surfaceForModelKey("feedback_embedding_model")).toBe("feedback");
    expect(byokFeatureDefaultModelKey("anthropic", "assistant_model")).toBe(
      "byok_default_anthropic_assistant_model",
    );
  });
});
