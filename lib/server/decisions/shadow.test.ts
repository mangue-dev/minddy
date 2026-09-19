import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shadow comparison (MIN-567), with the LLM adapter, the ledger and the
 * base mocked. The contract pinned here:
 *
 * - the comparison ALWAYS replays the real LLM adapter (`runLlmDecision`)
 *   — the LLM is the reference — under its own run and the `jev_shadow`
 *   feature, never as the use case's pass;
 * - a failed replay writes a row whose LLM half says "unknown"
 *   (`agree` NULL), never an exception;
 * - the agreement counts only where BOTH engines answered, multi-choice
 *   answers compare as sets.
 */

const { newRunIdMock, spentFromLedgerMock, runLlmDecisionMock, fromMock } = vi.hoisted(() => ({
  newRunIdMock: vi.fn<() => string>(),
  spentFromLedgerMock: vi.fn<(runId: string) => Promise<number | null>>(),
  runLlmDecisionMock: vi.fn<
    (spec: unknown, ctx: unknown) => Promise<Record<string, unknown> | null>
  >(),
  fromMock: vi.fn<(table: string) => unknown>(),
}));

vi.mock("@/lib/server/ai-usage", () => ({
  newRunId: newRunIdMock,
  spentFromLedger: spentFromLedgerMock,
}));
vi.mock("@/lib/server/decisions/llm", () => ({
  runLlmDecision: runLlmDecisionMock,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: fromMock }),
}));

const { compareDecisionAnswers, runShadowComparison } = await import("./shadow");
import type { DecisionSpec } from "./types";

const BILL_TO = { userId: "user-1" } as const;

const SPEC: DecisionSpec = {
  useCase: "smart_fill",
  state: { project: "p" },
  questions: [
    {
      key: "priority",
      kind: "single_choice",
      label: "priority",
      options: [{ value: "high", label: "high" }],
    },
    {
      key: "category_ids",
      kind: "multi_choice",
      label: "categories",
      options: [
        { value: "cat-1", label: "Bug" },
        { value: "cat-2", label: "Feature" },
      ],
      maxSelections: 3,
    },
  ],
  llm: { toolName: "fill_issue", parameters: {}, systemPrompt: "s", userMessage: "u" },
};

const JEV_ANSWERS = {
  priority: { value: "high", probability: 0.9, confidence: 0.9 },
  category_ids: { value: ["cat-1", "cat-2"], probability: null, confidence: 0.8 },
};

function expectRow() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  fromMock.mockReturnValue({ insert });
  return insert;
}

beforeEach(() => {
  newRunIdMock.mockReset().mockReturnValue("shadow-run-id");
  spentFromLedgerMock.mockReset().mockResolvedValue(0.002);
  runLlmDecisionMock.mockReset();
  fromMock.mockReset();
});

describe("compareDecisionAnswers", () => {
  it("agrees when every comparable answer matches", () => {
    const llm = {
      priority: { value: "high", probability: null, confidence: null },
      category_ids: { value: ["cat-2", "cat-1"], probability: null, confidence: null },
    };
    expect(compareDecisionAnswers(SPEC, JEV_ANSWERS, llm)).toBe(true);
  });

  it("compares multi-choice answers as SETS, not lists", () => {
    const reordered = {
      ...JEV_ANSWERS,
      category_ids: { value: ["cat-2", "cat-1"], probability: null, confidence: null },
    };
    expect(compareDecisionAnswers(SPEC, JEV_ANSWERS, reordered)).toBe(true);
  });

  it("disagrees on a different pick", () => {
    const llm = {
      priority: { value: "low", probability: null, confidence: null },
      category_ids: { value: ["cat-1"], probability: null, confidence: null },
    };
    expect(compareDecisionAnswers(SPEC, JEV_ANSWERS, llm)).toBe(false);
  });

  it("skips the questions the reference did not answer — silence is not dissent", () => {
    const llm = {
      priority: { value: "high", probability: null, confidence: null },
    };
    expect(compareDecisionAnswers(SPEC, JEV_ANSWERS, llm)).toBe(true);
  });

  it("reads an EMPTY multi-choice verdict as a real answer, not silence", () => {
    // The LLM tool schema requires category_ids: `[]` is a judged "nothing
    // fits". Against a Jev answer that picked categories, it must DISAGREE —
    // skipping it would inflate the agreement metric.
    const empty = {
      priority: { value: "high", probability: null, confidence: null },
      category_ids: { value: [], probability: null, confidence: null },
    };
    expect(compareDecisionAnswers(SPEC, JEV_ANSWERS, empty)).toBe(false);
    const jevEmpty = {
      ...JEV_ANSWERS,
      category_ids: { value: [], probability: null, confidence: null },
    };
    expect(compareDecisionAnswers(SPEC, jevEmpty, empty)).toBe(true);
  });

  it("returns null when nothing is comparable (the reference answered nothing)", () => {
    expect(compareDecisionAnswers(SPEC, JEV_ANSWERS, {})).toBeNull();
  });

  it("reads a type mismatch (value vs list) as a disagreement", () => {
    const llm = {
      priority: { value: "high", probability: null, confidence: null },
      category_ids: { value: "cat-1", probability: null, confidence: null },
    };
    expect(compareDecisionAnswers(SPEC, JEV_ANSWERS, llm)).toBe(false);
  });
});

describe("runShadowComparison", () => {
  const INPUT = {
    spec: SPEC,
    jevAnswers: JEV_ANSWERS,
    jevConfidence: 0.9,
    jevLatencyMs: 421.6,
    billTo: BILL_TO,
    projectId: "project-1",
    subjectId: "issue-1",
  };

  it("replays the REAL LLM adapter as the reference, under its own run and feature", async () => {
    const insert = expectRow();
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
      category_ids: { value: ["cat-2", "cat-1"], probability: null, confidence: null },
    });
    await runShadowComparison(INPUT);
    expect(runLlmDecisionMock).toHaveBeenCalledTimes(1);
    const [spec, ctx] = runLlmDecisionMock.mock.calls[0] as [
      DecisionSpec,
      { runId: string; seq: number; billTo: unknown; projectId: string; feature: string },
    ];
    expect(spec).toBe(SPEC);
    expect(ctx.runId).toBe("shadow-run-id");
    expect(ctx.seq).toBe(0);
    expect(ctx.billTo).toEqual(BILL_TO);
    expect(ctx.projectId).toBe("project-1");
    // The replay NEVER bills as the use case's pass: the sampling delta
    // must stay one readable line (`jev_shadow`) in the ledger.
    expect(ctx.feature).toBe("jev_shadow");
    // The Jev answers are NEVER re-asked: one Jev call happened on the real
    // decision, the shadow replays only the LLM.
    expect(fromMock).toHaveBeenCalledWith("ai_decision_evaluations");
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      use_case: "smart_fill",
      subject_id: "issue-1",
      jev_answers: JEV_ANSWERS,
      jev_confidence: 0.9,
      agree: true,
      llm_cost: 0.002,
      jev_latency_ms: 422,
    });
    expect(typeof row.llm_latency_ms).toBe("number");
  });

  it("disagrees — and says so — when the reference picks differently", async () => {
    const insert = expectRow();
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "low", probability: null, confidence: null },
      category_ids: { value: ["cat-1"], probability: null, confidence: null },
    });
    await runShadowComparison(INPUT);
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.agree).toBe(false);
    // No answer declared a confidence: unknown stays null, never a
    // dressed-up 1 (the review's finding).
    expect(row.llm_confidence).toBeNull();
  });

  it("persists the weakest DECLARED confidence of the replay, when one exists", async () => {
    const insert = expectRow();
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
      category_ids: { value: ["cat-1"], probability: null, confidence: 0.7 },
    });
    await runShadowComparison(INPUT);
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.llm_confidence).toBe(0.7);
  });

  it("writes an unknown agreement when the replay fails — never an exception", async () => {
    const insert = expectRow();
    runLlmDecisionMock.mockResolvedValue(null);
    spentFromLedgerMock.mockResolvedValue(0);
    await expect(runShadowComparison(INPUT)).resolves.toBeUndefined();
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      llm_answers: null,
      llm_confidence: null,
      agree: null,
      llm_latency_ms: null,
      llm_cost: 0,
    });
  });

  it("keeps an empty replay answer as incomparable, but still measured", async () => {
    const insert = expectRow();
    runLlmDecisionMock.mockResolvedValue({});
    await runShadowComparison(INPUT);
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.agree).toBeNull();
    expect(typeof row.llm_latency_ms).toBe("number");
  });

  it("swallows a failed write — the metric never rises out of the background", async () => {
    const insert = vi.fn().mockResolvedValue({ error: new Error("insert refused") });
    fromMock.mockReturnValue({ insert });
    runLlmDecisionMock.mockResolvedValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runShadowComparison(INPUT)).resolves.toBeUndefined();
    errorSpy.mockRestore();
  });

  it("swallows a thrown replay — same contract, one missing comparison", async () => {
    const insert = expectRow();
    runLlmDecisionMock.mockRejectedValue(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runShadowComparison(INPUT)).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
