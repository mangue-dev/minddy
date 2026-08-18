import { describe, expect, it } from "vitest";

import {
  agentCompactThreshold,
  AGENT_COMPACT_BASELINE_TOKENS,
  AGENT_COMPACT_MAX_TOKENS_CEILING,
  AGENT_COMPACT_REFERENCE_INPUT_USD_PER_MTOK,
  AGENT_COMPACT_TOKEN_THRESHOLD,
} from "./agent-models";

/**
 * The compaction threshold limits a COST PER ROUND, not a number of tokens.
 *
 * Hardwritten at 120,000, it said the same thing at `deepseek-v4-flash`
 * ($0.14/Mtok) and at `claude-opus-4.8` ($5/Mtok) — or $0.017 versus $0.60 the
 * round, thirty-six times the difference for a spending safeguard. These tests freeze
 * the three terminals of the conversion, and especially what they PROTECT.
 *
 * The prices are those recorded on the OpenRouter index on 2026-08-09.
 */

const WINDOW_1M = 1_000_000;

describe("agentCompactThreshold", () => {
  it("returns the value calibrated to the reference price — nothing changes for the default model", () => {
    expect(
      agentCompactThreshold({
        contextWindow: 1_048_576, // deepseek-v4-flash
        inputUsdPerMTok: AGENT_COMPACT_REFERENCE_INPUT_USD_PER_MTOK,
      }),
    ).toBe(AGENT_COMPACT_BASELINE_TOKENS);
  });

  it("INCREASES for a cheaper model at a constant cost per round", () => {
    // gpt-5.6-luna, $0.10/Mtok: 40% cheaper than the reference, therefore 40%
    // more context for the same price.
    const threshold = agentCompactThreshold({ contextWindow: 1_050_000, inputUsdPerMTok: 0.1 });
    expect(threshold).toBe(168_000);
    // The property that counts, and it is verified in dollars: the prompt of a round
    // at the threshold costs the same as at the reference.
    const atReference =
      (AGENT_COMPACT_BASELINE_TOKENS / 1e6) * AGENT_COMPACT_REFERENCE_INPUT_USD_PER_MTOK;
    expect((threshold / 1e6) * 0.1).toBeCloseTo(atReference, 6);
  });

  it("does not DECREASE for an expensive model — compacting earlier does not save money", () => {
    // The model would redeem in rereadings what we take from it: it is MIN-248, and
    // it's more expensive than the history we would have kept.
    for (const price of [2, 5, 15]) {
      expect(agentCompactThreshold({ contextWindow: WINDOW_1M, inputUsdPerMTok: price })).toBe(
        AGENT_COMPACT_BASELINE_TOKENS,
      );
    }
  });

  it("ne monte pas jusqu'à un seuil que les runs n'atteignent jamais", () => {
    // The largest context ever observed on the agent: 158,301 tokens. A model
    // quasi gratuit donnerait un seuil de plusieurs millions — donc pas de seuil du
    // everything, which is exactly the breakdown of MIN-113.
    const threshold = agentCompactThreshold({ contextWindow: WINDOW_1M, inputUsdPerMTok: 0.001 });
    expect(threshold).toBe(AGENT_COMPACT_MAX_TOKENS_CEILING);
    expect(threshold).toBeGreaterThan(158_301);
  });

  it("stays below 75% of the window even when the price would allow more", () => {
    // An inexpensive model with a SMALL window: the budget cannot exceed what
    // the model can read.
    expect(agentCompactThreshold({ contextWindow: 128_000, inputUsdPerMTok: 0.01 })).toBe(96_000);
  });

  it("does not change for an unknown price: ignoring it does not permit an increase", () => {
    // BYOK outside the OpenRouter catalog. We keep the calibrated value rather than
    // to extrapolate on ignorance.
    expect(agentCompactThreshold({ contextWindow: WINDOW_1M, inputUsdPerMTok: null })).toBe(
      AGENT_COMPACT_BASELINE_TOKENS,
    );
    expect(agentCompactThreshold({ contextWindow: WINDOW_1M })).toBe(
      AGENT_COMPACT_BASELINE_TOKENS,
    );
  });

  it("treats a FREE model as an unknown price, not an infinite budget", () => {
    // A zero price does not cancel the latency or attention degradation of a
    // excessive history — and division by zero says nothing true.
    expect(agentCompactThreshold({ contextWindow: WINDOW_1M, inputUsdPerMTok: 0 })).toBe(
      AGENT_COMPACT_BASELINE_TOKENS,
    );
  });

  it("falls back to the default when the window is unknown", () => {
    expect(agentCompactThreshold({ contextWindow: null, inputUsdPerMTok: 0.1 })).toBe(
      AGENT_COMPACT_TOKEN_THRESHOLD,
    );
  });
});
