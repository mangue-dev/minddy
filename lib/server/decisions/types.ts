/**
 * Contract of a structured AI decision (MIN-557/MIN-562).
 *
 * Every AI decision of the first lot (Smart Fill, Smart Assign, feedback AI
 * review, later Triage Smart) flows through ONE shape: the use case prepares
 * its data as a `DecisionSpec` (pure builder, `prepare.ts`), the runner
 * (`runner.ts`) asks Jev first and falls back to the existing LLM pass
 * (`llm.ts`), and the use case applies its own degradation when the runner
 * returns `null` — never blocking the user.
 *
 * Two kinds of modules meet here and nothing else: PURE code (this file,
 * `prepare.ts`, the parsing/validation halves of the adapters) and the two
 * network transports (`jev.ts`, `llm.ts`). The per-use-case policies that
 * consume the answers (`sanitizeSmartFill`, `decideFeedbackReview`, the
 * Smart Assign owner fallback) stay where they are — they are the common
 * exit door of every engine.
 */

/** The use cases the decision layer serves in the first lot (MIN-557). */
export type DecisionUseCase =
  | "smart_fill"
  | "smart_assign"
  | "feedback_review"
  | "smart_triage";

/** Every known use case, for config parsing (`jev_llm_first`, MIN-567). */
export const DECISION_USE_CASES: DecisionUseCase[] = [
  "smart_fill",
  "smart_assign",
  "feedback_review",
  "smart_triage",
];

/** Which engine produced the answers of a decision. */
export type DecisionEngine = "jev" | "llm";

/**
 * Why the runner left Jev, when it did. `null` = Jev answered and was
 * trusted. The reason is informational (logs, later the MIN-567 metrics);
 * the caller never branches on it — the answers are the contract.
 */
export type DecisionFallbackReason =
  | "jev_disabled"
  | "jev_unavailable"
  | "jev_low_confidence"
  /**
   * The use case is calibrated LLM-first (MIN-567): listed in the
   * `jev_llm_first` `app_config` key, it skips Jev entirely. A use case ends
   * up here only when the shadow comparison showed it structurally bad at
   * Jev — the switch is a config edit, never a deploy.
   */
  | "jev_llm_first";

/**
 * Hard ceiling of the choices engine, taken from the decisions API (MIN-561
 * findings): 255 options max per `choice` question. The builders cap their
 * option lists well below (60 context items for Smart Fill), but the
 * contract holds the API's own bound so a use case never discovers it live.
 */
export const MAX_DECISION_OPTIONS = 255;

/** One selectable value of a choice question. Real ids only: categories,
 * objectives and members come from the database, enums from
 * `lib/issue-validation`. Nothing is ever invented at build time. */
export interface DecisionOption {
  /** Stable value echoed back by the engines (a real id or an enum value). */
  value: string;
  /** Human-readable name, shown to the engines as the option's meaning. */
  label: string;
  /** Optional free description that refines the label. */
  description?: string;
}

/** One level of a `score` question, ordered from lowest to highest. */
export interface DecisionScoreLevel {
  /** Numeric value of the level, echoed back by the engine. */
  value: number;
  /** Human-readable name of the level (`xs`, `medium`, …). */
  label: string;
}

interface DecisionQuestionBase {
  /**
   * Stable key, named by the use case (the same key the LLM tool schema
   * already uses: `priority`, `user_id`, `category_ids`…). Engines echo
   * answers under this key; consumers read the answer by this key.
   */
  key: string;
  /** Short human-readable statement of what the question asks. */
  label: string;
}

/** Exactly one option must be picked. */
export interface DecisionSingleChoiceQuestion extends DecisionQuestionBase {
  kind: "single_choice";
  options: DecisionOption[];
}

/** Zero to `maxSelections` options may be picked. */
export interface DecisionMultiChoiceQuestion extends DecisionQuestionBase {
  kind: "multi_choice";
  options: DecisionOption[];
  /** Cap on the picked options — bounded at build time, ≤ MAX_DECISION_OPTIONS. */
  maxSelections: number;
}

/** A yes/no question (Jev `noul`). */
export interface DecisionBooleanQuestion extends DecisionQuestionBase {
  kind: "boolean";
}

/** A graded answer on an ordered level list. */
export interface DecisionScoreQuestion extends DecisionQuestionBase {
  kind: "score";
  /** Ordered from lowest to highest; the engine answers one value. */
  levels: DecisionScoreLevel[];
}

export type DecisionQuestion =
  | DecisionSingleChoiceQuestion
  | DecisionMultiChoiceQuestion
  | DecisionBooleanQuestion
  | DecisionScoreQuestion;

/**
 * The LLM pass of a use case, kept VERBATIM from the pre-decision code
 * (MIN-562: the existing prompts and tool schemas are unchanged so the
 * fallback behaves exactly like today). Aligning them on the System One
 * question format for fair comparisons is an open option for MIN-567.
 */
export interface DecisionLlmRecipe {
  toolName: string;
  parameters: Record<string, unknown>;
  systemPrompt: string;
  userMessage: string;
}

/** Everything an engine needs to answer one use case's questions. */
export interface DecisionSpec {
  useCase: DecisionUseCase;
  /**
   * Dense structured state, System One style — the assembled facts the
   * questions are evaluated against. NEVER empty: Jev answers confidently
   * on a "nothing fits" option when the state says nothing (MIN-561), and a
   * confident answer on no information is worth nothing. The runner refuses
   * to call with an empty state.
   */
  state: Record<string, unknown>;
  questions: DecisionQuestion[];
  llm: DecisionLlmRecipe;
}

/** What one engine says about ONE question. */
export interface DecisionAnswer {
  /**
   * Typed by the question's kind: `string` for single_choice, `string[]`
   * for multi_choice, `boolean` for boolean, `number` for score. Consumers
   * narrow with the question they asked.
   */
  value: string | string[] | boolean | number;
  /**
   * Probability attached to the chosen value (top option for a choice,
   * P(yes) for a boolean), 0–1. `null` when the engine gives none.
   */
  probability: number | null;
  /**
   * Confidence that THIS answer is right, 0–1. `null` when the engine gives
   * none — the LLM passes only produce one for the duplicate verdict today.
   */
  confidence: number | null;
}

/** Answers of one engine, by question key. */
export type DecisionAnswers = Record<string, DecisionAnswer>;

/** The result of a decision the caller can act on. */
export interface DecisionOutcome {
  engine: DecisionEngine;
  answers: DecisionAnswers;
  /**
   * Global confidence, 0–1: the weakest per-question confidence of the
   * answers (1 when no answer carries a confidence — the neutral value for
   * the floor check, which only ever gates Jev anyway).
   */
  confidence: number;
  fallbackReason: DecisionFallbackReason | null;
}

/** Clamp a 0–1 number; anything non-numeric or out of range folds into the bound. */
export function clamp01(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return null;
  return Math.min(1, Math.max(0, parsed));
}

/**
 * Global confidence of a set of answers: the weakest per-question
 * confidence (falling back to the answer's probability when the engine gave
 * none), skipping answers that carry neither. Questions the engine did not
 * answer are skipped — a partial answer is judged on what it did answer,
 * the per-use-case policy decides what a missing answer is worth.
 */
export function decisionConfidence(spec: DecisionSpec, answers: DecisionAnswers): number {
  let confidence = 1;
  let seen = false;
  for (const question of spec.questions) {
    const answer = answers[question.key];
    if (!answer) continue;
    const value = clamp01(answer.confidence) ?? clamp01(answer.probability);
    if (value === null) continue;
    seen = true;
    confidence = Math.min(confidence, value);
  }
  return seen ? confidence : 1;
}

/**
 * Structural validation of a spec, run by the runner BEFORE any engine
 * call. A spec that fails it is a programming fault caught at the last
 * safe moment: the runner returns `null` (the use case degrades) and logs,
 * rather than sending a malformed body to an engine.
 *
 * Checks the invariants the builders are responsible for: known use case,
 * unique question keys, non-empty state, options within the API cardinality
 * (and non-empty for single choice — a choice without options is a question
 * Jev can only answer wrongly), bounded multi_selection, non-empty score
 * levels, and option values without the `:` separator (it encodes
 * multi-choice sub-questions on the wire, `jev.ts`).
 */
export function validateDecisionSpec(spec: DecisionSpec): boolean {
  if (!spec.state || typeof spec.state !== "object" || Array.isArray(spec.state)) return false;
  if (Object.keys(spec.state).length === 0) return false;
  if (spec.questions.length === 0) return false;
  const seenKeys = new Set<string>();
  for (const question of spec.questions) {
    if (seenKeys.has(question.key)) return false;
    seenKeys.add(question.key);
    switch (question.kind) {
      case "single_choice":
        if (question.options.length === 0 || question.options.length > MAX_DECISION_OPTIONS)
          return false;
        break;
      case "multi_choice":
        if (
          question.options.length === 0 ||
          question.options.length > MAX_DECISION_OPTIONS ||
          question.maxSelections < 1 ||
          question.maxSelections > question.options.length
        )
          return false;
        break;
      case "boolean":
        break;
      case "score":
        if (question.levels.length < 2) return false;
        break;
    }
    for (const value of optionValues(question)) {
      if (value.includes(":")) return false;
    }
  }
  return true;
}

/** The allowed values of a question, whatever its kind. */
export function optionValues(question: DecisionQuestion): string[] {
  switch (question.kind) {
    case "single_choice":
    case "multi_choice":
      return question.options.map((o) => o.value);
    case "boolean":
      return [];
    case "score":
      return question.levels.map((l) => String(l.value));
  }
}
