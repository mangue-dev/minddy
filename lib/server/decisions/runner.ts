import "server-only";

import { aiModelFallback } from "@/lib/ai-model-config";
import { newRunId, type AiUsageBillTo } from "@/lib/server/ai-usage";
import { getAppConfigValues } from "@/lib/server/app-config";
import {
  decisionConfidence,
  validateDecisionSpec,
  type DecisionFallbackReason,
  type DecisionOutcome,
  type DecisionSpec,
} from "@/lib/server/decisions/types";
import { runJevDecision, type DecisionCallContext } from "@/lib/server/decisions/jev";
import { runLlmDecision } from "@/lib/server/decisions/llm";

/**
 * The runner of the decision layer (MIN-562) — the ONE path every structured
 * AI decision of the first lot takes (MIN-557):
 *
 *   use case builds its spec (pure, `prepare.ts`)
 *     → Jev first (`jev.ts`), one call, no retry
 *     → unavailable OR confidence under `jev_confidence_floor` → the existing
 *       LLM pass (`llm.ts`), verbatim
 *     → both failed → `null`, and the use case applies ITS OWN degradation
 *       (empty Smart Fill patch, Smart Assign owner fallback, feedback human
 *       review) — a decision NEVER blocks the user.
 *
 * The budgets are checked by the CALLER before entering (as today): the
 * runner only spends what it was authorized to spend, and both engines
 * record their lines on the same run id — a mixed decision reads as one
 * gesture with one line per engine, no double imputation.
 */

/** Calibratable: MIN-567 owns the real numbers from the shadow comparison. */
export const DEFAULT_JEV_CONFIDENCE_FLOOR = 0.55;
export const DEFAULT_JEV_SHADOW_SAMPLE_RATE = 0.05;

export interface JevDecisionSettings {
  /**
   * `jev_decisions_enabled` — the incident kill-switch laid down by MIN-561,
   * NOT a product setting: off means "LLM everywhere, today's behavior".
   */
  enabled: boolean;
  /** Jev answers under this global confidence are discarded for the LLM pass. */
  confidenceFloor: number;
  /**
   * Share of decisions sampled for the Jev-vs-LLM shadow comparison. Read
   * here so the calibration has one home; MIN-567 wires the shadow pass.
   */
  shadowSampleRate: number;
}

function parseFloatClamped(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

/**
 * The Jev knobs, read like `feedback_merge_auto_threshold` — plain
 * `app_config` keys OUTSIDE the admin registry (no UI by decision, MIN-557):
 * they exist for calibration, not for tuning from the dashboard.
 */
export async function loadJevDecisionSettings(): Promise<JevDecisionSettings> {
  const cfg = await getAppConfigValues([
    "jev_decisions_enabled",
    "jev_confidence_floor",
    "jev_shadow_sample_rate",
  ]).catch(() => ({}) as Record<string, string | null>);
  return {
    enabled:
      (cfg["jev_decisions_enabled"] ?? aiModelFallback("jev_decisions_enabled")).trim() !==
      "false",
    confidenceFloor: parseFloatClamped(cfg["jev_confidence_floor"], DEFAULT_JEV_CONFIDENCE_FLOOR),
    shadowSampleRate: parseFloatClamped(
      cfg["jev_shadow_sample_rate"],
      DEFAULT_JEV_SHADOW_SAMPLE_RATE
    ),
  };
}

/** Who the decision bills, and under which project — carried to both engines. */
export interface DecisionRunInput {
  billTo: AiUsageBillTo;
  projectId?: string | null;
}

/**
 * Run one decision. Resolves to the answers of ONE engine — Jev when it
 * answered confidently enough, the LLM otherwise — or `null` when both
 * failed, which the use case reads as "apply your degradation".
 */
export async function runDecision(
  spec: DecisionSpec,
  input: DecisionRunInput
): Promise<DecisionOutcome | null> {
  // A malformed spec is a programming fault caught at the last safe moment:
  // degrade (and say so loudly) rather than send garbage to an engine.
  if (!validateDecisionSpec(spec)) {
    console.error(`[decisions] invalid spec for ${spec.useCase} — degrading`);
    return null;
  }
  const settings = await loadJevDecisionSettings();
  const runId = newRunId();
  const ctx: DecisionCallContext = {
    runId,
    billTo: input.billTo,
    projectId: input.projectId ?? null,
  };

  let fallbackReason: DecisionFallbackReason;
  let jevRan = false;
  if (settings.enabled) {
    jevRan = true;
    const jevAnswers = await runJevDecision(spec, { ...ctx, seq: 0 });
    if (jevAnswers) {
      const confidence = decisionConfidence(spec, jevAnswers);
      if (confidence >= settings.confidenceFloor) {
        return { engine: "jev", answers: jevAnswers, confidence, fallbackReason: null };
      }
      // Confident about the wrong thing is still under the floor: the LLM
      // re-decides, the Jev answers are discarded, not merged.
      fallbackReason = "jev_low_confidence";
    } else {
      fallbackReason = "jev_unavailable";
    }
  } else {
    fallbackReason = "jev_disabled";
  }

  // The fallback REPLACES the retry: one LLM pass, on the same run.
  const llmAnswers = await runLlmDecision(spec, { ...ctx, seq: jevRan ? 1 : 0 });
  if (!llmAnswers) return null;
  return {
    engine: "llm",
    answers: llmAnswers,
    confidence: decisionConfidence(spec, llmAnswers),
    fallbackReason,
  };
}

/**
 * Should this decision be sampled for the shadow comparison — pure, so the
 * rate semantics (a uniform roll under the rate) are testable on their own.
 * MIN-567 consumes it; exposed here because the rate lives with the runner.
 */
export function shouldShadowSample(rate: number, roll: number = Math.random()): boolean {
  return rate > 0 && roll < rate;
}
