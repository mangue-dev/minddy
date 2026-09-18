import "server-only";

import type { ByokModelKey } from "@/lib/ai-surfaces";
import type { AiFeature } from "@/lib/server/ai-usage-shape";
import { forcedToolCall } from "@/lib/server/feedback/forced-tool-call";
import { resolveConfiguredModel } from "@/lib/server/model-config";
import { clamp01, type DecisionAnswers, type DecisionSpec } from "@/lib/server/decisions/types";
import type { DecisionCallContext } from "@/lib/server/decisions/jev";

/**
 * The LLM adapter of the decision layer (MIN-562): the fallback pass, built
 * on `forcedToolCall()` and the EXISTING per-use-case tools (`fill_issue`,
 * `choose_assignee`, `review_feedback`). The prompts and tool schemas ride
 * in the spec, produced verbatim by the builders of `prepare.ts` — MIN-562
 * changes nothing to them, so a fallback decision behaves exactly like the
 * pass it replaces. Aligning them later on the System One question format
 * (for fair Jev/LLM comparisons in MIN-567) is an open option.
 *
 * The mapping is strict, as in the passes today: a value outside the spec's
 * options is dropped, a missing argument simply produces no answer — the
 * use case's pure policy (`sanitizeSmartFill`, `decideFeedbackReview`, …)
 * decides what a missing answer is worth. `null` on any failure; the use
 * case then applies its own degradation.
 */

interface LlmPassProfile {
  modelKey: ByokModelKey;
  feature: AiFeature;
  xTitle: string;
  logPrefix: string;
  maxTokens?: number;
  timeoutMs?: number;
}

/** The existing pass of each use case, unchanged (model, tool, billing feature). */
const LLM_PASSES: Record<DecisionSpec["useCase"], LlmPassProfile> = {
  smart_fill: {
    modelKey: "smart_fill_model",
    feature: "smart_fill",
    xTitle: "minddy Smart-fill",
    logPrefix: "smart-fill",
    maxTokens: 256,
    // Someone is waiting in front of their screen: the same ceiling as the pass.
    timeoutMs: 20_000,
  },
  smart_assign: {
    modelKey: "smart_assign_model",
    feature: "smart_assign",
    xTitle: "Smart Assign (minddy)",
    logPrefix: "[smart-assign]",
    maxTokens: 256,
  },
  feedback_review: {
    modelKey: "feedback_analysis_model",
    feature: "feedback_classify",
    xTitle: "Feedback Review (minddy)",
    logPrefix: "[feedback-review]",
  },
};

/** One allowed-value check for a choice answer. */
function choiceAnswer(
  raw: unknown,
  allowed: string[]
): { value: string; probability: null; confidence: null } | null {
  return typeof raw === "string" && allowed.includes(raw)
    ? { value: raw, probability: null, confidence: null }
    : null;
}

/**
 * Raw tool arguments → decision answers, per use case. The keys mirror the
 * tool arguments, which the builders made identical to the question keys;
 * the special cases are the ones the passes already handle today.
 */
export function mapLlmAnswers(spec: DecisionSpec, raw: Record<string, unknown>): DecisionAnswers {
  const question = (key: string): DecisionSpec["questions"][number] | undefined =>
    spec.questions.find((q) => q.key === key);
  const options = (key: string): string[] => {
    const q = question(key);
    if (!q || (q.kind !== "single_choice" && q.kind !== "multi_choice")) return [];
    return q.options.map((o) => o.value);
  };
  const answers: DecisionAnswers = {};

  switch (spec.useCase) {
    case "smart_fill": {
      const priority = choiceAnswer(raw.priority, options("priority"));
      if (priority) answers.priority = priority;
      const effort = choiceAnswer(raw.effort, options("effort"));
      if (effort) answers.effort = effort;
      const objective = choiceAnswer(raw.objective_id, options("objective_id"));
      if (objective) answers.objective_id = objective;
      const allowedCategories = options("category_ids");
      const categoryQuestion = question("category_ids");
      const max =
        categoryQuestion?.kind === "multi_choice" ? categoryQuestion.maxSelections : 0;
      if (allowedCategories.length > 0 && Array.isArray(raw.category_ids)) {
        const ids = [
          ...new Set(
            raw.category_ids.filter(
              (id): id is string => typeof id === "string" && allowedCategories.includes(id)
            )
          ),
        ].slice(0, max);
        if (ids.length > 0) answers.category_ids = { value: ids, probability: null, confidence: null };
      }
      break;
    }
    case "smart_assign": {
      const assignee = choiceAnswer(raw.user_id, options("user_id"));
      if (assignee) answers.user_id = assignee;
      break;
    }
    case "feedback_review": {
      // A missing boolean reads "no" — exactly what the pass does today
      // (`args.is_junk === true`); the moderation is fail-safe by construction.
      answers.is_junk = { value: raw.is_junk === true, probability: null, confidence: null };
      answers.is_sensitive = { value: raw.is_sensitive === true, probability: null, confidence: null };
      const sensitivity = choiceAnswer(
        typeof raw.sensitivity_kind === "string" && raw.sensitivity_kind
          ? raw.sensitivity_kind
          : "none",
        options("sensitivity_kind")
      );
      if (sensitivity) answers.sensitivity_kind = sensitivity;
      // A null duplicate is a real verdict ("no duplicate"): the "none"
      // sentinel carries it, the confidence rides on the same answer.
      const duplicateRaw =
        typeof raw.duplicate_of === "string" && raw.duplicate_of ? raw.duplicate_of : "none";
      const duplicate = choiceAnswer(duplicateRaw, options("duplicate_of"));
      if (duplicate) {
        answers.duplicate_of = { ...duplicate, confidence: clamp01(raw.confidence) };
      }
      const allowedCategories = options("category_ids");
      if (allowedCategories.length > 0 && Array.isArray(raw.category_ids)) {
        const ids = [
          ...new Set(
            raw.category_ids.filter(
              (id): id is string => typeof id === "string" && allowedCategories.includes(id)
            )
          ),
        ];
        if (ids.length > 0) answers.category_ids = { value: ids, probability: null, confidence: null };
      }
      break;
    }
  }
  return answers;
}

/**
 * One LLM fallback decision: resolve the use case's configured model, replay
 * the pass verbatim through `forcedToolCall`, map the answer. `null` on any
 * failure — the use case applies its own degradation, never the user waits
 * for a retry here.
 */
export async function runLlmDecision(
  spec: DecisionSpec,
  ctx: DecisionCallContext
): Promise<DecisionAnswers | null> {
  const profile = LLM_PASSES[spec.useCase];
  const { model } = await resolveConfiguredModel(profile.modelKey).catch(() => ({ model: null }));
  if (!model) return null;
  const args = await forcedToolCall(
    model,
    spec.llm.systemPrompt,
    spec.llm.userMessage,
    spec.llm.toolName,
    spec.llm.parameters,
    {
      xTitle: profile.xTitle,
      logPrefix: profile.logPrefix,
      modelKey: profile.modelKey,
      ...(profile.maxTokens !== undefined ? { maxTokens: profile.maxTokens } : {}),
      ...(profile.timeoutMs !== undefined ? { timeoutMs: profile.timeoutMs } : {}),
      record: {
        feature: profile.feature,
        runId: ctx.runId,
        seq: ctx.seq,
        billTo: ctx.billTo,
        projectId: ctx.projectId ?? null,
      },
    }
  );
  if (!args) return null;
  return mapLlmAnswers(spec, args);
}
