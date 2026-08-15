import { describe, expect, it } from "vitest";

import {
  AI_SURFACES,
  byokFeatureDefaultModelKey,
  parseAiSurfaces,
  parseByokFeatureModels,
  surfaceForModelKey,
} from "@/lib/ai-surfaces";

describe("AI surfaces", () => {
  it("accepte toutes les surfaces et permet de tout laisser au quota Minddy", () => {
    expect(parseAiSurfaces(AI_SURFACES)).toEqual(AI_SURFACES);
    expect(parseAiSurfaces([])).toEqual([]);
  });

  it("refuse les surfaces inconnues et les doublons", () => {
    expect(parseAiSurfaces(["agent", "unknown"])).toBeNull();
    expect(parseAiSurfaces(["assistant", "assistant"])).toBeNull();
  });

  it("nettoie les modèles vides et refuse les clés inconnues", () => {
    expect(
      parseByokFeatureModels({ assistant_model: "  claude-sonnet-5  ", brief_model: " " }),
    ).toEqual({ assistant_model: "claude-sonnet-5" });
    expect(parseByokFeatureModels({ mystery_model: "x" })).toBeNull();
  });

  it("relie chaque modèle à sa surface et à sa clé admin", () => {
    expect(surfaceForModelKey("automation_agent_model")).toBe("automations");
    expect(surfaceForModelKey("smart_fill_model")).toBe("automations");
    expect(surfaceForModelKey("feedback_embedding_model")).toBe("feedback");
    expect(byokFeatureDefaultModelKey("anthropic", "assistant_model")).toBe(
      "byok_default_anthropic_assistant_model",
    );
  });
});
