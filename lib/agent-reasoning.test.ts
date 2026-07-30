import { describe, expect, it } from "vitest";
import {
  capReasoningLevel,
  isReasoningLevel,
  reasoningMaxTokens,
  reasoningRequestFields,
  REASONING_LEVELS,
  toReasoningLevel,
} from "./agent-reasoning";

/**
 * Tests du niveau de raisonnement (MIN-122). Ce qui compte ici : rien n'est
 * envoyé tant qu'on ne l'a pas explicitement demandé ET que le provider ne l'a
 * pas déclaré au registre — un champ inconnu revient en 400 et tue le round.
 */

describe("isReasoningLevel / toReasoningLevel", () => {
  it("accepte les quatre niveaux et rien d'autre", () => {
    for (const level of REASONING_LEVELS) expect(isReasoningLevel(level)).toBe(true);
    expect(isReasoningLevel("maximum")).toBe(false);
    expect(isReasoningLevel("")).toBe(false);
    expect(isReasoningLevel(null)).toBe(false);
    expect(isReasoningLevel(2)).toBe(false);
  });

  it("normalise tout le reste en `off`", () => {
    expect(toReasoningLevel("high")).toBe("high");
    expect(toReasoningLevel("nope")).toBe("off");
    expect(toReasoningLevel(undefined)).toBe("off");
  });
});

describe("reasoningRequestFields", () => {
  it("n'envoie RIEN à `off`, quel que soit le provider", () => {
    expect(reasoningRequestFields("off", "openrouter")).toEqual({});
    expect(reasoningRequestFields("off", "openai")).toEqual({});
  });

  it("n'envoie RIEN sur un niveau inconnu ou absent", () => {
    expect(reasoningRequestFields(null, "openrouter")).toEqual({});
    expect(reasoningRequestFields(undefined, "openrouter")).toEqual({});
    expect(reasoningRequestFields("maximum" as never, "openrouter")).toEqual({});
  });

  it("n'envoie RIEN au provider générique, même à `high`", () => {
    // Base URL inconnue : un serveur OpenAI-compatible strict rejette le champ.
    expect(reasoningRequestFields("high", "generic")).toEqual({});
  });

  it("forme IMBRIQUÉE sur OpenRouter, trace demandée", () => {
    expect(reasoningRequestFields("medium", "openrouter")).toEqual({
      reasoning: { effort: "medium", exclude: false },
    });
  });

  it("forme PLATE sur les couches compat OpenAI", () => {
    expect(reasoningRequestFields("low", "openai")).toEqual({ reasoning_effort: "low" });
    expect(reasoningRequestFields("high", "anthropic")).toEqual({ reasoning_effort: "high" });
    expect(reasoningRequestFields("medium", "google")).toEqual({ reasoning_effort: "medium" });
  });

  it("n'émet jamais budget_tokens ni thinkingConfig (champs d'API natives)", () => {
    for (const provider of ["openrouter", "openai", "anthropic", "google", "generic"] as const) {
      const body = JSON.stringify(reasoningRequestFields("high", provider));
      expect(body).not.toContain("budget_tokens");
      expect(body).not.toContain("thinkingConfig");
      expect(body).not.toContain("thinking");
    }
  });
});

describe("reasoningMaxTokens", () => {
  it("laisse le plafond intact à `off` ou sur un niveau invalide", () => {
    expect(reasoningMaxTokens(8192, "off")).toBe(8192);
    expect(reasoningMaxTokens(8192, null)).toBe(8192);
  });

  it("relève le plafond, et de plus en plus haut avec le niveau", () => {
    const off = reasoningMaxTokens(8192, "off")!;
    const low = reasoningMaxTokens(8192, "low")!;
    const medium = reasoningMaxTokens(8192, "medium")!;
    const high = reasoningMaxTokens(8192, "high")!;
    expect(off).toBeLessThan(low);
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
  });

  it("reste absent quand le provider n'envoie pas de max_tokens", () => {
    expect(reasoningMaxTokens(undefined, "high")).toBeUndefined();
  });
});

describe("capReasoningLevel", () => {
  it("laisse tout passer en BYOK (l'utilisateur paie)", () => {
    expect(capReasoningLevel("high", "byok")).toBe("high");
  });

  it("plafonne `high` à `medium` sur le quota minddy", () => {
    expect(capReasoningLevel("high", "platform")).toBe("medium");
    expect(capReasoningLevel("medium", "platform")).toBe("medium");
    expect(capReasoningLevel("off", "platform")).toBe("off");
  });
});
