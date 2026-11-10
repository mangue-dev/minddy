import { describe, expect, it } from "vitest";
import { AI_MODEL_CONFIG_KEYS, stripModelSuffix } from "@/lib/ai-model-config";

/**
 * OpenRouter routing shortcuts (MIN-263). The dashboard no longer sets them
 * (MIN-954); an id typed with one is still sent as is, and replayed bare when
 * refused.
 */

describe("stripModelSuffix", () => {
  it("returns the bare id", () => {
    for (const suffix of ["nitro", "floor", "exacto"]) {
      expect(stripModelSuffix(`anthropic/claude-sonnet-5:${suffix}`)).toBe("anthropic/claude-sonnet-5");
    }
  });

  it("is neutral for an already bare id", () => {
    expect(stripModelSuffix("anthropic/claude-sonnet-5")).toBe("anthropic/claude-sonnet-5");
  });

  it("does not touch a model variant", () => {
    // `…:free` denotes another model, not a routing order: cutting it would
    // replay a refusal on the PAID variant, silently.
    for (const model of ["qwen/qwen3-coder:free", "anthropic/claude-sonnet-5:thinking", "openai/gpt-5:online"]) {
      expect(stripModelSuffix(model)).toBe(model);
    }
  });
});

describe("registry", () => {
  it("offers no routing shortcut to the admin API (MIN-954)", () => {
    expect([...AI_MODEL_CONFIG_KEYS].filter((key) => key.endsWith("_suffix"))).toEqual([]);
  });
});
