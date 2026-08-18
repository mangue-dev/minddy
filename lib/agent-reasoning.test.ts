import { describe, expect, it } from "vitest";
import {
  DEFAULT_REASONING_LEVEL,
  GENERIC_REASONING_LEVELS,
  isReasoningLevel,
  nearestReasoningLevel,
  reasoningLevelsFor,
  reasoningMaxTokens,
  reasoningRequestFields,
  REASONING_LEVELS,
  toReasoningLevel,
} from "./agent-reasoning";

/**
 * Reasoning level tests (MIN-122). What matters here: nothing is
 * sent until it is explicitly requested AND the provider has not declared it to the registry — an unknown field returns as 400 and kills the round.
 */

describe("isReasoningLevel / toReasoningLevel", () => {
  it("accepte tout le vocabulaire et rien d'autre", () => {
    for (const level of REASONING_LEVELS) expect(isReasoningLevel(level)).toBe(true);
    expect(isReasoningLevel("maximum")).toBe(false);
    // `none` is the OpenRouter word; ours is `off`, and it says a little more
    // (do not send ANY fields). The translation is done by reading the index.
    expect(isReasoningLevel("none")).toBe(false);
    expect(isReasoningLevel("")).toBe(false);
    expect(isReasoningLevel(null)).toBe(false);
    expect(isReasoningLevel(2)).toBe(false);
  });

  it("normalizes everything else to the default", () => {
    expect(toReasoningLevel("high")).toBe("high");
    expect(toReasoningLevel("nope")).toBe(DEFAULT_REASONING_LEVEL);
    expect(toReasoningLevel(undefined)).toBe(DEFAULT_REASONING_LEVEL);
  });

  it("the default is `medium` — the agent reasons a little unless told otherwise", () => {
    expect(DEFAULT_REASONING_LEVEL).toBe("medium");
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
    // Unknown URL base: a strict OpenAI-compatible server rejects the field.
    expect(reasoningRequestFields("high", "generic")).toEqual({});
  });

  it("uses the NESTED form on OpenRouter when tracing is requested", () => {
    expect(reasoningRequestFields("medium", "openrouter")).toEqual({
      reasoning: { effort: "medium", exclude: false },
    });
  });

  it("uses the FLAT form on OpenAI and Gemini; Anthropic expects the model", () => {
    expect(reasoningRequestFields("low", "openai")).toEqual({ reasoning_effort: "low" });
    expect(reasoningRequestFields("high", "anthropic")).toEqual({});
    expect(reasoningRequestFields("medium", "google")).toEqual({ reasoning_effort: "medium" });
    expect(reasoningRequestFields("minimal", "openai")).toEqual({ reasoning_effort: "minimal" });
  });

  it("passe `xhigh` et `max` tels quels à OpenRouter — c'est SON vocabulaire", () => {
    expect(reasoningRequestFields("xhigh", "openrouter")).toEqual({
      reasoning: { effort: "xhigh", exclude: false },
    });
    expect(reasoningRequestFields("max", "openrouter")).toEqual({
      reasoning: { effort: "max", exclude: false },
    });
  });

  it("but FALLS BACK on compatibility layers that do not know them", () => {
    // OpenRouter itself falls back on what the model accepts; sent directly,
    // these two come back to 400 and kill the round. Lose a notch
    // thinking is better than losing the turn.
    expect(reasoningRequestFields("xhigh", "openai")).toEqual({ reasoning_effort: "high" });
    expect(reasoningRequestFields("max", "anthropic")).toEqual({});
  });

  it("the model-less function never emits a random Anthropic contract", () => {
    for (const provider of ["openrouter", "openai", "anthropic", "google", "generic"] as const) {
      const body = JSON.stringify(reasoningRequestFields("high", provider));
      expect(body).not.toContain("budget_tokens");
      expect(body).not.toContain("thinkingConfig");
      expect(body).not.toContain("thinking");
    }
  });
});

describe("reasoningMaxTokens", () => {
  it("leaves the cap intact at `off` or for an invalid level", () => {
    expect(reasoningMaxTokens(8192, "off")).toBe(8192);
    expect(reasoningMaxTokens(8192, null)).toBe(8192);
  });

  it("raises the cap higher and higher with the level", () => {
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

describe("reasoningLevelsFor — what the selector offers", () => {
  it("without metadata, the four historical levels", () => {
    // A direct BYOK, a non-index model: we know nothing, we promise nothing
    // more than what worked before.
    expect(reasoningLevelsFor(null)).toEqual(GENERIC_REASONING_LEVELS);
    expect(reasoningLevelsFor(undefined)).toEqual(GENERIC_REASONING_LEVELS);
  });

  it("the levels PUBLISHED by the model, preceded by « no reasoning »", () => {
    // `openai/gpt-5.1-codex-max` en vrai : xhigh|high|medium|low, non obligatoire.
    expect(
      reasoningLevelsFor({ efforts: ["low", "medium", "high", "xhigh"], mandatory: false }),
    ).toEqual(["off", "low", "medium", "high", "xhigh"]);
  });

  it("a model that ALWAYS reasons has no « no reasoning » level", () => {
    // `google/gemini-3.6-flash` en vrai : mandatory, minimal|low|medium|high. Lui
    // sending `none` breaks the call — so the option should not exist on the screen.
    expect(
      reasoningLevelsFor({ efforts: ["minimal", "low", "medium", "high"], mandatory: true }),
    ).toEqual(["minimal", "low", "medium", "high"]);
  });

  it("a model that reasons without publishing an enumeration falls back to the generic levels", () => {
    // Les Claude: `{ mandatory: false }`, and nothing else.
    expect(reasoningLevelsFor({ efforts: [], mandatory: false })).toEqual(
      GENERIC_REASONING_LEVELS,
    );
  });
});

describe("nearestReasoningLevel", () => {
  it("keeps the level when the model accepts it", () => {
    expect(nearestReasoningLevel("high", ["low", "medium", "high"])).toBe("high");
  });

  it("descend d'abord — on ne dépense jamais plus que demandé", () => {
    expect(nearestReasoningLevel("max", ["low", "medium", "high"])).toBe("high");
    expect(nearestReasoningLevel("medium", ["off", "low"])).toBe("low");
  });

  it("but moves back up when the model has nothing cheaper", () => {
    // A model that only accepts `high` must receive `high`, even on a default
    // personal to `low`: the selector cannot display a level that it does not list.
    expect(nearestReasoningLevel("low", ["high"])).toBe("high");
  });

  it("laisse passer quand on ne sait rien de ce qu'il accepte", () => {
    expect(nearestReasoningLevel("xhigh", [])).toBe("xhigh");
  });

  it("the entire vocabulary is ordered from cheapest to most expensive", () => {
    // The rank of `REASONING_LEVELS` IS the scale that `nearestReasoningLevel`
    // goes down: putting them out of order would collapse `max` to `minimal`.
    expect(REASONING_LEVELS).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });
});
