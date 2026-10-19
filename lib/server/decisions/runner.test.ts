import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The runner's decision table, with both adapters mocked — this is the
 * file that pins the ONE contract of the layer:
 *
 *   the configured decision model, once (never retried) → under the floor or unavailable → the LLM,
 *   verbatim → both failed → null, and the use case degrades ITSELF.
 *
 * The billing shape is asserted too: one run id per decision, one line per
 * engine (decision model seq 0, LLM seq 1) — a mixed decision reads as one gesture
 * with two lines, never a double imputation.
 *
 * The shadow sampling (MIN-567) is pinned here as well, on a deterministic
 * roll: a CONFIDENT decision-model decision schedules the comparison in the
 * background (`afterOrNow`, captured, never awaited on the decision path),
 * a roll over the rate schedules nothing, and a decision that already fell
 * back to the LLM is never sampled — the LLM decided for real, there is
 * nothing left to compare against.
 */

const {
  getAppConfigValuesMock,
  afterOrNowMock,
  runModelDecisionMock,
  runLlmDecisionMock,
  runShadowComparisonMock,
} = vi.hoisted(() => {
  const getAppConfigValuesMock = vi.fn<() => Promise<Record<string, string | null>>>();
  const afterOrNowMock = vi.fn<(work: () => void | Promise<void>) => void>();
  const mkAdapter = () =>
    vi.fn<
      (
        spec: unknown,
        ctx: { runId: string; seq?: number; billTo: unknown; projectId?: string | null }
      ) => Promise<unknown>
    >();
  return {
    getAppConfigValuesMock,
    afterOrNowMock,
    runModelDecisionMock: mkAdapter(),
    runLlmDecisionMock: mkAdapter(),
    runShadowComparisonMock: vi.fn<(input: unknown) => Promise<void>>(),
  };
});

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: getAppConfigValuesMock,
}));
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: afterOrNowMock,
}));
vi.mock("@/lib/server/decisions/decision-model", () => ({
  runModelDecision: runModelDecisionMock,
}));
const warmLlmDecisionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/decisions/llm", () => ({
  runLlmDecision: runLlmDecisionMock,
  warmLlmDecision: warmLlmDecisionMock,
}));
vi.mock("@/lib/server/decisions/shadow", () => ({
  runShadowComparison: runShadowComparisonMock,
}));

const { runDecision, loadDecisionModelSettings, shouldShadowSample } = await import("./runner");
import type { DecisionSpec } from "./types";

const BILL_TO = { userId: "user-1" } as const;

const SPEC: DecisionSpec = {
  useCase: "smart_fill",
  state: { project: "p", issue: { title: "t" } },
  questions: [
    {
      key: "priority",
      kind: "single_choice",
      label: "priority",
      options: [{ value: "high", label: "high" }],
    },
  ],
  llm: { toolName: "fill_issue", parameters: {}, systemPrompt: "s", userMessage: "u" },
};

const CONFIDENT_ANSWERS = {
  priority: { value: "high", probability: 0.9, confidence: 0.9 },
};

/** The versioned id the decisions endpoint reports for the configured model. */
const MODEL = "liquid/d1-20260930";

/** A decision-model result: the answers and the model that gave them. */
function answered<T>(answers: T) {
  return { answers, model: MODEL };
}

beforeEach(() => {
  getAppConfigValuesMock.mockReset().mockResolvedValue({});
  afterOrNowMock.mockReset().mockImplementation(() => {});
  runModelDecisionMock.mockReset();
  runLlmDecisionMock.mockReset();
  warmLlmDecisionMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  runShadowComparisonMock.mockReset().mockResolvedValue(undefined);
});

/** The deterministic roll of the shadow sampling: Math.random is the draw. */
function roll(value: number) {
  vi.spyOn(Math, "random").mockReturnValue(value);
}

describe("runDecision", () => {
  it("trusts a confident decision model: one decision-model call, ZERO LLM call", async () => {
    runModelDecisionMock.mockResolvedValue(answered(CONFIDENT_ANSWERS));
    const outcome = await runDecision(SPEC, { billTo: BILL_TO });
    expect(runModelDecisionMock).toHaveBeenCalledTimes(1);
    expect(runLlmDecisionMock).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      engine: "model",
      model: MODEL,
      answers: CONFIDENT_ANSWERS,
      confidence: 0.9,
      fallbackReason: null,
    });
  });

  it("falls back to the LLM when the decision model is unavailable, and NEVER retries the decision model", async () => {
    runModelDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
    });
    const outcome = await runDecision(SPEC, { billTo: BILL_TO });
    expect(runModelDecisionMock).toHaveBeenCalledTimes(1);
    expect(runLlmDecisionMock).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      engine: "llm",
      fallbackReason: "model_unavailable",
    });
  });

  it("falls back to the LLM when the decision model is under the confidence floor, discarding its answers", async () => {
    runModelDecisionMock.mockResolvedValue(answered({
      priority: { value: "high", probability: 0.3, confidence: 0.3 },
    }));
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
    });
    const outcome = await runDecision(SPEC, { billTo: BILL_TO });
    expect(outcome).toMatchObject({
      engine: "llm",
      answers: { priority: { value: "high" } },
      fallbackReason: "model_low_confidence",
    });
  });

  it("returns null when both engines fail — the use case applies its own degradation", async () => {
    runModelDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue(null);
    const outcome = await runDecision(SPEC, { billTo: BILL_TO });
    expect(outcome).toBeNull();
  });

  describe("when the LLM fallback fails after a low-confidence decision model (MIN-687)", () => {
    const TWO_QUESTION_SPEC: DecisionSpec = {
      ...SPEC,
      questions: [
        ...SPEC.questions,
        {
          key: "effort",
          kind: "single_choice",
          label: "effort",
          options: [{ value: "m", label: "m" }],
        },
      ],
    };
    const MIXED_ANSWERS = {
      priority: { value: "high", probability: 0.8, confidence: 0.8 },
      effort: { value: "m", probability: 0.3, confidence: 0.3 },
    };

    it("keeps only the decision-model answers that meet the floor on their own, when opted in", async () => {
      runModelDecisionMock.mockResolvedValue(answered(MIXED_ANSWERS));
      runLlmDecisionMock.mockResolvedValue(null);
      const outcome = await runDecision(TWO_QUESTION_SPEC, {
        billTo: BILL_TO,
        keepConfidentModelAnswers: true,
      });
      expect(outcome).toEqual({
        engine: "model",
        model: MODEL,
        answers: { priority: MIXED_ANSWERS.priority },
        confidence: 0.8,
        fallbackReason: "model_low_confidence",
        partial: true,
      });
    });

    it("still returns null without the opt-in, so other use cases keep their degradation", async () => {
      runModelDecisionMock.mockResolvedValue(answered(MIXED_ANSWERS));
      runLlmDecisionMock.mockResolvedValue(null);
      expect(await runDecision(TWO_QUESTION_SPEC, { billTo: BILL_TO })).toBeNull();
    });

    it("returns null when no single decision-model answer meets the floor", async () => {
      runModelDecisionMock.mockResolvedValue(answered({ effort: MIXED_ANSWERS.effort }));
      runLlmDecisionMock.mockResolvedValue(null);
      expect(
        await runDecision(TWO_QUESTION_SPEC, { billTo: BILL_TO, keepConfidentModelAnswers: true })
      ).toBeNull();
    });

    it("logs a correlated reason code with field names, never answer values", async () => {
      runModelDecisionMock.mockResolvedValue(answered(MIXED_ANSWERS));
      runLlmDecisionMock.mockResolvedValue(null);
      await runDecision(TWO_QUESTION_SPEC, { billTo: BILL_TO, keepConfidentModelAnswers: true });
      const runId = runModelDecisionMock.mock.calls[0][1].runId;
      const logged = vi.mocked(console.warn).mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain(
        `[decisions] smart_fill llm_failed after=model_low_confidence run=${runId} kept=priority`
      );
      expect(logged).not.toContain("high");
    });

    it("warms the LLM fallback while the decision model answers", async () => {
      runModelDecisionMock.mockResolvedValue(answered(CONFIDENT_ANSWERS));
      await runDecision(SPEC, { billTo: BILL_TO });
      expect(warmLlmDecisionMock).toHaveBeenCalledWith(SPEC);
    });
  });

  it("refuses a malformed spec without calling any engine", async () => {
    const outcome = await runDecision(
      { ...SPEC, state: {} },
      { billTo: BILL_TO }
    );
    expect(outcome).toBeNull();
    expect(runModelDecisionMock).not.toHaveBeenCalled();
    expect(runLlmDecisionMock).not.toHaveBeenCalled();
  });

  it("bills a mixed decision as ONE run with one line per engine, in order", async () => {
    runModelDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
    });
    await runDecision(SPEC, { billTo: BILL_TO, projectId: "project-1" });
    const modelCtx = runModelDecisionMock.mock.calls[0][1];
    const llmCtx = runLlmDecisionMock.mock.calls[0][1];
    expect(modelCtx.runId).toBe(llmCtx.runId);
    expect(modelCtx.seq).toBe(0);
    expect(llmCtx.seq).toBe(1);
    expect(modelCtx.billTo).toEqual(BILL_TO);
    expect(llmCtx.projectId).toBe("project-1");
  });

});

describe("shadow sampling (MIN-567)", () => {
  it("samples a confident decision-model decision on a roll under the rate, AFTER the response", async () => {
    getAppConfigValuesMock.mockResolvedValue({ jev_shadow_sample_rate: "0.05" });
    runModelDecisionMock.mockResolvedValue(answered(CONFIDENT_ANSWERS));
    roll(0.04);
    const outcome = await runDecision(SPEC, {
      billTo: BILL_TO,
      projectId: "project-1",
      subjectId: "issue-1",
    });
    // The decision is final BEFORE the comparison runs: the shadow measures,
    // it never decides.
    expect(outcome).toMatchObject({ engine: "model", fallbackReason: null });
    expect(afterOrNowMock).toHaveBeenCalledTimes(1);
    expect(runShadowComparisonMock).not.toHaveBeenCalled();
    const [work] = afterOrNowMock.mock.calls[0] as [() => Promise<void>];
    await work();
    expect(runShadowComparisonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: SPEC,
        model: MODEL,
        modelAnswers: CONFIDENT_ANSWERS,
        modelConfidence: 0.9,
        billTo: BILL_TO,
        projectId: "project-1",
        subjectId: "issue-1",
        modelLatencyMs: expect.any(Number),
      })
    );
  });

  it("never samples on a roll over the rate", async () => {
    getAppConfigValuesMock.mockResolvedValue({ jev_shadow_sample_rate: "0.05" });
    runModelDecisionMock.mockResolvedValue(answered(CONFIDENT_ANSWERS));
    roll(0.06);
    await runDecision(SPEC, { billTo: BILL_TO });
    expect(afterOrNowMock).not.toHaveBeenCalled();
  });

  it("never samples at rate 0, whatever the roll", async () => {
    getAppConfigValuesMock.mockResolvedValue({ jev_shadow_sample_rate: "0" });
    runModelDecisionMock.mockResolvedValue(answered(CONFIDENT_ANSWERS));
    roll(0);
    await runDecision(SPEC, { billTo: BILL_TO });
    expect(afterOrNowMock).not.toHaveBeenCalled();
  });

  it("NEVER samples a decision that already fell back to the LLM", async () => {
    // Unavailable, under the floor, LLM-first: whatever the reason, the
    // LLM decided for real — there is nothing left to compare against.
    getAppConfigValuesMock.mockResolvedValue({ jev_shadow_sample_rate: "1" });
    runModelDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
    });
    roll(0);
    await runDecision(SPEC, { billTo: BILL_TO });
    expect(afterOrNowMock).not.toHaveBeenCalled();
    getAppConfigValuesMock.mockResolvedValue({
      jev_shadow_sample_rate: "1",
      jev_confidence_floor: "0.99",
    });
    runModelDecisionMock.mockResolvedValue(answered({
      priority: { value: "high", probability: 0.3, confidence: 0.3 },
    }));
    await runDecision(SPEC, { billTo: BILL_TO });
    expect(afterOrNowMock).not.toHaveBeenCalled();
    getAppConfigValuesMock.mockResolvedValue({
      jev_llm_first: "smart_fill",
      jev_shadow_sample_rate: "1",
    });
    await runDecision(SPEC, { billTo: BILL_TO });
    expect(afterOrNowMock).not.toHaveBeenCalled();
  });

  it("samples each confident decision independently", async () => {
    getAppConfigValuesMock.mockResolvedValue({ jev_shadow_sample_rate: "1" });
    runModelDecisionMock.mockResolvedValue(answered(CONFIDENT_ANSWERS));
    roll(0);
    await runDecision(SPEC, { billTo: BILL_TO });
    await runDecision(SPEC, { billTo: BILL_TO });
    expect(afterOrNowMock).toHaveBeenCalledTimes(2);
  });
});

describe("LLM-first switch (MIN-567)", () => {
  it("sends a listed use case straight to the LLM, without touching the decision model", async () => {
    getAppConfigValuesMock.mockResolvedValue({
      jev_llm_first: "smart_fill",
      jev_shadow_sample_rate: "1",
    });
    roll(0);
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
    });
    const outcome = await runDecision(SPEC, { billTo: BILL_TO });
    expect(runModelDecisionMock).not.toHaveBeenCalled();
    expect(runLlmDecisionMock).toHaveBeenCalledTimes(1);
    expect(runLlmDecisionMock.mock.calls[0][1].seq).toBe(0);
    expect(outcome).toMatchObject({ engine: "llm", fallbackReason: "llm_first" });
    // LLM-first is NOT shadowed the other way round: the LLM decided for
    // real, and the LLM is the reference — there is no decision-model side to compare.
    expect(afterOrNowMock).not.toHaveBeenCalled();
  });

  it("keeps other use cases on the decision model while one is LLM-first", async () => {
    getAppConfigValuesMock.mockResolvedValue({ jev_llm_first: "smart_assign" });
    runModelDecisionMock.mockResolvedValue(answered(CONFIDENT_ANSWERS));
    const outcome = await runDecision(SPEC, { billTo: BILL_TO });
    expect(runModelDecisionMock).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ engine: "model", fallbackReason: null });
  });
});

describe("loadDecisionModelSettings", () => {
  it("defaults to floor 0.55, shadow rate 0.05, no LLM-first use case", async () => {
    await expect(loadDecisionModelSettings()).resolves.toEqual({
      confidenceFloor: 0.55,
      shadowSampleRate: 0.05,
      llmFirstUseCases: [],
    });
  });

  it("reads the calibrated values and clamps them into 0–1", async () => {
    getAppConfigValuesMock.mockResolvedValue({
      jev_confidence_floor: "0.7",
      jev_shadow_sample_rate: "0.5",
    });
    await expect(loadDecisionModelSettings()).resolves.toEqual({
      confidenceFloor: 0.7,
      shadowSampleRate: 0.5,
      llmFirstUseCases: [],
    });
    getAppConfigValuesMock.mockResolvedValue({
      jev_confidence_floor: "12",
      jev_shadow_sample_rate: "-3",
    });
    await expect(loadDecisionModelSettings()).resolves.toEqual({
      confidenceFloor: 1,
      shadowSampleRate: 0,
      llmFirstUseCases: [],
    });
  });

  it("parses the LLM-first list case-insensitively, dropping unknown names", async () => {
    getAppConfigValuesMock.mockResolvedValue({
      jev_llm_first: " Smart_Fill ,unknown_use_case,SMART-TRIAGE , smart_assign ",
    });
    await expect(loadDecisionModelSettings()).resolves.toMatchObject({
      llmFirstUseCases: ["smart_fill", "smart_assign"],
    });
    getAppConfigValuesMock.mockResolvedValue({ jev_llm_first: "" });
    await expect(loadDecisionModelSettings()).resolves.toMatchObject({
      llmFirstUseCases: [],
    });
  });
});

describe("shouldShadowSample", () => {
  it("samples a uniform roll under the rate, and never at rate 0", () => {
    expect(shouldShadowSample(0.05, 0.04)).toBe(true);
    expect(shouldShadowSample(0.05, 0.06)).toBe(false);
    expect(shouldShadowSample(0, 0)).toBe(false);
  });
});
