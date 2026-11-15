import { describe, expect, it } from "vitest";

import {
  AI_SURFACES,
  byokFeatureDefaultModelKey,
  parseAiSurfaces,
  parseByokFeatureModels,
  surfaceForModelKey,
} from "@/lib/ai-surfaces";

describe("AI surfaces", () => {
  it("accepts every surface and an empty list that leaves everything on the Minddy quota", () => {
    expect(parseAiSurfaces(AI_SURFACES)).toEqual(AI_SURFACES);
    expect(parseAiSurfaces([])).toEqual([]);
  });

  it("rejects unknown and duplicate surfaces", () => {
    expect(parseAiSurfaces(["agent", "unknown"])).toBeNull();
    expect(parseAiSurfaces(["assistant", "assistant"])).toBeNull();
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
