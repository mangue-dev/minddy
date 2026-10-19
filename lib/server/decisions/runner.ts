import "server-only";

import { newRunId, type AiUsageBillTo } from "@/lib/server/ai-usage";
import { afterOrNow } from "@/lib/server/after-safe";
import { getAppConfigValues } from "@/lib/server/app-config";
import {
  DECISION_USE_CASES,
  confidentAnswers,
  decisionConfidence,
  validateDecisionSpec,
  type DecisionAnswers,
  type DecisionFallbackReason,
  type DecisionOutcome,
  type DecisionSpec,
  type DecisionUseCase,
} from "@/lib/server/decisions/types";
import { runModelDecision, type DecisionCallContext } from "@/lib/server/decisions/decision-model";
import { runLlmDecision, warmLlmDecision } from "@/lib/server/decisions/llm";
import { runShadowComparison } from "@/lib/server/decisions/shadow";

/**
 * The runner of the decision layer (MIN-562) — the ONE path every structured
 * AI decision of the first lot takes (MIN-557):
 *
 *   use case builds its spec (pure, `prepare.ts`)
 *     → the configured decision model first (`decision-model.ts`, one global
 *       `jev_model` setting, Jev by default — MIN-694), one call, no retry
 *     → unavailable OR confidence under `jev_confidence_floor` → the existing
 *       LLM pass (`llm.ts`), verbatim
 *     → both failed → `null`, and the use case applies ITS OWN degradation
 *       (empty Smart Fill patch, Smart Assign owner fallback, feedback human
 *       review) — a decision NEVER blocks the user.
 *
 * Two knobs ride along (MIN-567), both plain `app_config` keys, both
 * invisible to the caller:
 *
 * - `jev_llm_first` — a use case listed there skips the decision model and
 *   decides with the LLM directly. The calibrated escape hatch when the
 *   shadow comparison shows the use case structurally bad at decision models.
 * - `jev_shadow_sample_rate` — after a CONFIDENT model decision, a uniform
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
 *
 * The `jev_*` key and ledger names are historical identifiers kept by MIN-694
 * so existing settings, encrypted config rows and usage history carry over;
 * they apply to whichever decision model is configured. None of these knobs
 * selects a model: the model is the single `jev_model` setting, the LLM pass
 * keeps each use case's own LLM setting, and neither can diverge per use case.
 *
 * Calibration is per instance, not per model: `jev_confidence_floor` was
 * calibrated on Jev, and other decision models spread their confidences
 * differently (MIN-694 findings). After switching the model, read the shadow
 * metrics — now recorded with the model that answered — before trusting the
 * floor; raise it, or list a use case in `jev_llm_first`, if agreement drops.
 */

/** Calibratable: MIN-567 owns the real numbers from the shadow comparison. */
export const DEFAULT_DECISION_CONFIDENCE_FLOOR = 0.55;
export const DEFAULT_DECISION_SHADOW_SAMPLE_RATE = 0.05;

export interface DecisionModelSettings {
  /** Decision-model answers under this global confidence are discarded for the LLM pass. */
  confidenceFloor: number;
  /**
   * Share of decisions sampled for the model-vs-LLM shadow comparison. Read
   * here so the calibration has one home; the sampling itself is MIN-567.
   */
  shadowSampleRate: number;
  /**
   * `jev_llm_first` — the use cases that skip the decision model and decide
   * with the LLM directly (MIN-567). Populated ONLY from the shadow
   * comparison, when a use case proves structurally bad at the decision
   * model; a config edit, never a deploy.
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
 * The decision-model knobs, read like `feedback_merge_auto_threshold` — plain
 * `app_config` keys OUTSIDE the admin registry (no UI by decision, MIN-557):
 * they exist for calibration, not for tuning from the dashboard.
 */
export async function loadDecisionModelSettings(): Promise<DecisionModelSettings> {
  const cfg = await getAppConfigValues([
    "jev_confidence_floor",
    "jev_shadow_sample_rate",
    "jev_llm_first",
  ]).catch(() => ({}) as Record<string, string | null>);
  return {
    confidenceFloor: parseFloatClamped(cfg["jev_confidence_floor"], DEFAULT_DECISION_CONFIDENCE_FLOOR),
    shadowSampleRate: parseFloatClamped(
      cfg["jev_shadow_sample_rate"],
      DEFAULT_DECISION_SHADOW_SAMPLE_RATE
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
  /**
   * When the LLM fallback fails after a LOW-CONFIDENCE model decision, keep
   * the model answers that individually meet the floor instead of returning
   * `null` (MIN-687). Only for use cases whose policy accepts a partial
   * answer — Smart Fill fills the fields it got and leaves the others empty.
   */
  keepConfidentModelAnswers?: boolean;
}

/**
 * Run one decision. Resolves to the answers of ONE engine — the decision
 * model when it answered confidently enough, the LLM otherwise — or `null` when both
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
  const settings = await loadDecisionModelSettings();
  const runId = newRunId();
  const ctx: DecisionCallContext = {
    runId,
    billTo: input.billTo,
    projectId: input.projectId ?? null,
  };

  let fallbackReason: DecisionFallbackReason;
  let modelRan = false;
  let discardedModelAnswers: DecisionAnswers | null = null;
  let discardedModel: string | null = null;
  if (settings.llmFirstUseCases.includes(spec.useCase)) {
    fallbackReason = "llm_first";
  } else {
    modelRan = true;
    // The catalog loads while the decision model answers, so a fallback is ready to start.
    warmLlmDecision(spec);
    const modelStartedAt = performance.now();
    const result = await runModelDecision(spec, { ...ctx, seq: 0 });
    const modelLatencyMs = Math.round(performance.now() - modelStartedAt);
    if (result) {
      const { answers: modelAnswers, model } = result;
      const confidence = decisionConfidence(spec, modelAnswers);
      if (confidence >= settings.confidenceFloor) {
        // Shadow sampling (MIN-567): measure, never decide. The comparison
        // replays the LLM pass in the background — after the response, on a
        // uniform roll under the rate — and writes the agreement; the
        // outcome below is already final and unaffected by the replay.
        if (shouldShadowSample(settings.shadowSampleRate)) {
          afterOrNow(() =>
            runShadowComparison({
              spec,
              model,
              modelAnswers,
              modelConfidence: confidence,
              modelLatencyMs,
              billTo: input.billTo,
              projectId: input.projectId ?? null,
              subjectId: input.subjectId ?? null,
            })
          );
        }
        return {
          engine: "model",
          model,
          answers: modelAnswers,
          confidence,
          fallbackReason: null,
        };
      }
      // Confident about the wrong thing is still under the floor: the LLM
      // re-decides, the model answers are discarded, not merged.
      fallbackReason = "model_low_confidence";
      discardedModelAnswers = modelAnswers;
      discardedModel = model;
    } else {
      fallbackReason = "model_unavailable";
    }
  }

  // The fallback REPLACES the retry: one LLM pass, on the same run.
  const llmAnswers = await runLlmDecision(spec, { ...ctx, seq: modelRan ? 1 : 0 });
  if (!llmAnswers) {
    const kept =
      input.keepConfidentModelAnswers && discardedModelAnswers
        ? confidentAnswers(discardedModelAnswers, settings.confidenceFloor)
        : {};
    const keptKeys = Object.keys(kept);
    // Identifiers, fixed codes and field names only: never answers or text.
    console.warn(
      `[decisions] ${spec.useCase} llm_failed after=${fallbackReason} run=${runId} kept=${
        keptKeys.join(",") || "none"
      }`
    );
    if (keptKeys.length === 0 || !discardedModel) return null;
    return {
      engine: "model",
      model: discardedModel,
      answers: kept,
      confidence: decisionConfidence(spec, kept),
      fallbackReason,
      partial: true,
    };
  }
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
