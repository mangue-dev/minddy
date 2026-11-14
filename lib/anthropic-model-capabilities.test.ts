import { afterEach, describe, expect, it } from "vitest";

import {
  parseClaudeCapabilities,
  rememberClaudeCapabilities,
  resetClaudeCapabilities,
} from "./anthropic-model-capabilities";
import {
  anthropicModelReasoning,
  isAdaptiveClaude,
  isAlwaysThinkingClaude,
} from "./model-reasoning-rules";

const flag = (supported: boolean) => ({ supported });

/** Anthropic's `/v1/models` capabilities drive the Claude rules once seen (MIN-979). */
describe("Claude capabilities", () => {
  afterEach(() => resetClaudeCapabilities());

  it("reads the documented shape, with a null xhigh as unsupported", () => {
    expect(parseClaudeCapabilities({
      effort: { supported: true, low: flag(true), medium: flag(true), high: flag(true), max: flag(true), xhigh: null },
      thinking: { supported: true, types: {
        adaptive: flag(true), enabled: flag(false), disabled: flag(false), between_tools: flag(true),
      } },
    })).toEqual({
      thinking: true, adaptive: true, manual: false, canDisable: false,
      efforts: ["low", "medium", "high", "max"],
    });
    expect(parseClaudeCapabilities(null)).toBeNull();
    expect(parseClaudeCapabilities({ effort: {} })).toBeNull();
  });

  it("overrides the family rules for a model it has seen", () => {
    // Sonnet 5 can turn thinking off by its family rule; published data says otherwise here.
    expect(isAlwaysThinkingClaude("claude-sonnet-5")).toBe(false);
    rememberClaudeCapabilities("claude-sonnet-5", {
      thinking: true, adaptive: true, manual: false, canDisable: false, efforts: ["low", "high"],
    });
    expect(isAlwaysThinkingClaude("claude-sonnet-5")).toBe(true);
    expect(anthropicModelReasoning("claude-sonnet-5")).toEqual({ efforts: ["low", "high"], mandatory: true });
    // A model that does not think at all is never adaptive.
    rememberClaudeCapabilities("claude-haiku-4-5", {
      thinking: false, adaptive: false, manual: false, canDisable: true, efforts: [],
    });
    expect(isAdaptiveClaude("claude-haiku-4-5")).toBe(false);
    expect(isAlwaysThinkingClaude("claude-haiku-4-5")).toBe(false);
  });
});
