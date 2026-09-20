import "server-only";

import { aiModelFallback } from "@/lib/ai-model-config";
import { newRunId, type AiUsageBillTo } from "@/lib/server/ai-usage";
import { afterOrNow } from "@/lib/server/after-safe";
import { getAppConfigValues } from "@/lib/server/app-config";
import {
  DECISION_USE_CASES,
  decisionConfidence,
  validateDecisionSpec,
  type DecisionFallbackReason,
  type DecisionOutcome,
  type DecisionSpec,
  type DecisionUseCase,
} from "@/lib/server/decisions/types";
import { runJevDecision, type DecisionCallContext } from "@/lib/server/decisions/jev";
import { runLlmDecision } from "@/lib/server/decisions/llm";
import { runShadowComparison } from "@/lib/server/decisions/shadow";

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
 * Two knobs ride along (MIN-567), both plain `app_config` keys, both
 * invisible to the caller:
 *
 * - `jev_llm_first` — a use case listed there skips Jev and decides with
 *   the LLM directly. The calibrated escape hatch when the shadow comparison
 *   shows the use case structurally bad at Jev.
 * - `jev_shadow_sample_rate` — after a CONFIDENT Jev decision, a uniform
 *   roll under the rate schedules the shadow comparison (`shadow.ts`): the
 *   LLM pass replayed in the background, the agreement written to
 *   `ai_decision_evaluations`. The LLM is the reference; the replay never
 *   decides, never slows the response, and a decision that already fell
 *   back to the LLM is never sampled (there is nothing left to compare).
 *
 * The budgets are checked by the CALLER before entering (as today): the
 * runner only spends what it was authorized to spend, and both engines
 * record their lines on the same run id — a mixed decision reads as one
 * gesture with one line per engine, no double imputation. The shadow's
 * replay has its own run, billed under `jev_shadow`.
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
   * here so the calibration has one home; the sampling itself is MIN-567.
   */
  shadowSampleRate: number;
  /**
   * `jev_llm_first` — the use cases that skip Jev and decide with the LLM
   * directly (MIN-567). Populated ONLY from the shadow comparison, when a
   * use case proves structurally bad at Jev; a config edit, never a deploy.
   */
  llmFirstUseCases: DecisionUseCase[];
}

function parseFloatClamped(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

/** `jev_llm_first` is a comma-separated list of use case names; unknown
 * tokens (a typo, a future name) are ignored, not errors. */
function parseUseCaseList(value: string | null | undefined): DecisionUseCase[] {
  const known = new Set<string>(DECISION_USE_CASES);
  return (value ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token): token is DecisionUseCase => known.has(token as DecisionUseCase));
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
    "jev_llm_first",
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
    llmFirstUseCases: parseUseCaseList(cfg["jev_llm_first"]),
  };
}

/** Who the decision bills, and under which project — carried to both engines. */
export interface DecisionRunInput {
  billTo: AiUsageBillTo;
  projectId?: string | null;
  /**
   * The evaluated entity, when one exists — carried to the shadow comparison
   * row (`ai_decision_evaluations.subject_id`) so a sample can be traced
   * back to what it judged. `null` is normal: Smart Fill decides before the
   * issue exists, Smart Triage scores a whole column.
   */
  subjectId?: string | null;
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
  if (!settings.enabled) {
    fallbackReason = "jev_disabled";
  } else if (settings.llmFirstUseCases.includes(spec.useCase)) {
    fallbackReason = "jev_llm_first";
  } else {
    jevRan = true;
    const jevStartedAt = performance.now();
    const jevAnswers = await runJevDecision(spec, { ...ctx, seq: 0 });
    const jevLatencyMs = Math.round(performance.now() - jevStartedAt);
    if (jevAnswers) {
      const confidence = decisionConfidence(spec, jevAnswers);
      if (confidence >= settings.confidenceFloor) {
        // Shadow sampling (MIN-567): measure, never decide. The comparison
        // replays the LLM pass in the background — after the response, on a
        // uniform roll under the rate — and writes the agreement; the
        // outcome below is already final and unaffected by the replay.
        if (shouldShadowSample(settings.shadowSampleRate)) {
          afterOrNow(() =>
            runShadowComparison({
              spec,
              jevAnswers,
              jevConfidence: confidence,
              jevLatencyMs,
              billTo: input.billTo,
              projectId: input.projectId ?? null,
              subjectId: input.subjectId ?? null,
            })
          );
        }
        return { engine: "jev", answers: jevAnswers, confidence, fallbackReason: null };
      }
      // Confident about the wrong thing is still under the floor: the LLM
      // re-decides, the Jev answers are discarded, not merged.
      fallbackReason = "jev_low_confidence";
    } else {
      fallbackReason = "jev_unavailable";
    }
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
