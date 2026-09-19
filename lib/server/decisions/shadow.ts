import "server-only";

import { newRunId, spentFromLedger, type AiUsageBillTo } from "@/lib/server/ai-usage";
import { runLlmDecision } from "@/lib/server/decisions/llm";
import {
  clamp01,
  type DecisionAnswer,
  type DecisionAnswers,
  type DecisionSpec,
} from "@/lib/server/decisions/types";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * The shadow comparison of the decision layer (MIN-567) — the quality
 * metric behind the calibration of `jev_confidence_floor`.
 *
 * Principle: shadow sampling. After a CONFIDENT Jev decision on real
 * traffic, the LLM pass is replayed on a small sample (`jev_shadow_sample_rate`)
 * and the agreement is written to `ai_decision_evaluations`. The LLM is the
 * reference — the implementation proven before MIN-557 — so the shadow
 * ALWAYS replays the real LLM adapter (`runLlmDecision`), never a second
 * Jev call, and the row NEVER feeds back into the decision it shadows:
 * the caller's outcome was already returned.
 *
 * Everything here runs in the background (`afterOrNow`, scheduled by the
 * runner) and is best-effort: a failed replay or a failed write costs a
 * missing row, never an exception on the decision path.
 */

/** What the runner hands to the comparison when it samples a decision. */
export interface ShadowComparisonInput {
  spec: DecisionSpec;
  /** What Jev answered — the trusted outcome of the primary decision. */
  jevAnswers: DecisionAnswers;
  /** The global confidence the runner trusted Jev on. */
  jevConfidence: number;
  /** End-to-end duration of the Jev leg, measured by the runner. */
  jevLatencyMs: number;
  /** The decision's own billing — the replay bills the same payer, under
   * the `jev_shadow` feature, so the delta stays one readable line. */
  billTo: AiUsageBillTo;
  projectId: string | null;
  /** The evaluated entity, when one exists (Smart Assign's issue). */
  subjectId: string | null;
}

/** Whether two answer values say the same thing. Multi-choice answers are
 * compared as sets — the engines may list the same picks in another order. */
function sameAnswerValue(a: DecisionAnswer["value"], b: DecisionAnswer["value"]): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const picked = new Set(a);
    return b.every((value) => picked.has(value));
  }
  return a === b;
}

/**
 * Agreement of two engines on one spec, computed over the questions BOTH
 * answered. Jev's parsing is strict (every question answered or the adapter
 * fails), so the intersection is bounded by what the LLM pass answered — a
 * missing LLM answer reads "the reference said nothing", never a
 * disagreement. `null` when nothing is comparable: the replay failed, or it
 * answered none of the questions the spec asked. The full answer maps ride
 * in the row, so a finer per-question analysis stays possible after the fact.
 */
export function compareDecisionAnswers(
  spec: DecisionSpec,
  jev: DecisionAnswers,
  llm: DecisionAnswers
): boolean | null {
  let compared = 0;
  let agree = true;
  for (const question of spec.questions) {
    const jevAnswer = jev[question.key];
    const llmAnswer = llm[question.key];
    if (!jevAnswer || !llmAnswer) continue;
    compared += 1;
    if (!sameAnswerValue(jevAnswer.value, llmAnswer.value)) agree = false;
  }
  return compared > 0 ? agree : null;
}

/**
 * The weakest confidence the replay actually DECLARED, `null` when none of
 * its answers carries one — deliberately NOT `decisionConfidence`, whose
 * neutral value (1) would dress an unknown up as a certainty and corrupt
 * any query that reads `llm_confidence` back. The LLM passes carry no
 * confidence today (except the feedback duplicate verdict); when one
 * appears, it lands here.
 */
function declaredLlmConfidence(spec: DecisionSpec, answers: DecisionAnswers): number | null {
  let weakest: number | null = null;
  for (const question of spec.questions) {
    const answer: DecisionAnswer | undefined = answers[question.key];
    if (!answer) continue;
    const value = clamp01(answer.confidence);
    if (value === null) continue;
    weakest = weakest === null ? value : Math.min(weakest, value);
  }
  return weakest;
}

/** The one row shape `ai_decision_evaluations` accepts. */
interface EvaluationRow {
  use_case: string;
  subject_id: string | null;
  jev_answers: DecisionAnswers;
  jev_confidence: number;
  llm_answers: DecisionAnswers | null;
  llm_confidence: number | null;
  agree: boolean | null;
  jev_latency_ms: number;
  /** Measured even on a failed replay — the wait is real. */
  llm_latency_ms: number;
  llm_cost: number | null;
}

async function writeEvaluation(row: EvaluationRow): Promise<void> {
  try {
    const { error } = await getServiceClient()
      .from("ai_decision_evaluations")
      .insert(row);
    if (error) console.error("[decisions-shadow] insert failed:", error.message);
  } catch (err) {
    console.error("[decisions-shadow] insert threw:", (err as Error).message);
  }
}

/**
 * One shadow comparison: replay the LLM pass verbatim (its own ledger run,
 * billed under `jev_shadow`), read the replay's cost back from the ledger,
 * compare, write the row. Never throws — the write failure and the replay
 * failure both land as a row whose LLM half says "unknown".
 */
export async function runShadowComparison(input: ShadowComparisonInput): Promise<void> {
  try {
    const runId = newRunId();
    const startedAt = performance.now();
    const llmAnswers = await runLlmDecision(input.spec, {
      runId,
      seq: 0,
      billTo: input.billTo,
      projectId: input.projectId,
      feature: "jev_shadow",
    });
    const llmLatencyMs = Math.round(performance.now() - startedAt);
    const agree = llmAnswers
      ? compareDecisionAnswers(input.spec, input.jevAnswers, llmAnswers)
      : null;
    const llmConfidence = llmAnswers ? declaredLlmConfidence(input.spec, llmAnswers) : null;
    // The replay already wrote its line (a call = one ledger line): reading
    // the run back keeps the row's cost the TRUE delta of sampling, even
    // when the pass retries its fetch internally.
    const llmCost = await spentFromLedger(runId);
    await writeEvaluation({
      use_case: input.spec.useCase,
      subject_id: input.subjectId,
      jev_answers: input.jevAnswers,
      jev_confidence: input.jevConfidence,
      llm_answers: llmAnswers,
      llm_confidence: llmConfidence,
      agree,
      jev_latency_ms: Math.round(input.jevLatencyMs),
      // The latency of a FAILED replay is real waiting time: it counts in
      // the weekly latency comparison (timeouts included), while the
      // agreement stays out of it — `replay_failed` is the failure marker.
      llm_latency_ms: Math.round(llmLatencyMs),
      llm_cost: llmCost,
    });
  } catch (err) {
    console.error("[decisions-shadow] comparison failed:", (err as Error).message);
  }
}
