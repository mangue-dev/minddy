import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The runner's decision table, with both adapters mocked — this is the
 * file that pins the ONE contract of the layer:
 *
 *   Jev, once (never retried) → under the floor or unavailable → the LLM,
 *   verbatim → both failed → null, and the use case degrades ITSELF.
 *
 * The billing shape is asserted too: one run id per decision, one line per
 * engine (Jev seq 0, LLM seq 1) — a mixed decision reads as one gesture
 * with two lines, never a double imputation.
 */

const { getAppConfigValuesMock, runJevDecisionMock, runLlmDecisionMock } = vi.hoisted(() => {
  const getAppConfigValuesMock = vi.fn<() => Promise<Record<string, string | null>>>();
  const mkAdapter = () =>
    vi.fn<
      (
        spec: unknown,
        ctx: { runId: string; seq?: number; billTo: unknown; projectId?: string | null }
      ) => Promise<unknown>
    >();
  return {
    getAppConfigValuesMock,
    runJevDecisionMock: mkAdapter(),
    runLlmDecisionMock: mkAdapter(),
  };
});

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: getAppConfigValuesMock,
}));
vi.mock("@/lib/server/decisions/jev", () => ({
  runJevDecision: runJevDecisionMock,
}));
vi.mock("@/lib/server/decisions/llm", () => ({
  runLlmDecision: runLlmDecisionMock,
}));

const { runDecision, loadJevDecisionSettings, shouldShadowSample } = await import("./runner");
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

beforeEach(() => {
  getAppConfigValuesMock.mockReset().mockResolvedValue({});
  runJevDecisionMock.mockReset();
  runLlmDecisionMock.mockReset();
});

describe("runDecision", () => {
  it("trusts a confident Jev: one Jev call, ZERO LLM call", async () => {
    runJevDecisionMock.mockResolvedValue(CONFIDENT_ANSWERS);
    const outcome = await runDecision(SPEC, { billTo: BILL_TO });
    expect(runJevDecisionMock).toHaveBeenCalledTimes(1);
    expect(runLlmDecisionMock).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      engine: "jev",
      answers: CONFIDENT_ANSWERS,
      confidence: 0.9,
      fallbackReason: null,
    });
  });

  it("falls back to the LLM when Jev is unavailable, and NEVER retries Jev", async () => {
    runJevDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
    });
    const outcome = await runDecision(SPEC, { billTo: BILL_TO });
    expect(runJevDecisionMock).toHaveBeenCalledTimes(1);
    expect(runLlmDecisionMock).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      engine: "llm",
      fallbackReason: "jev_unavailable",
    });
  });

  it("falls back to the LLM when Jev is under the confidence floor, discarding its answers", async () => {
    runJevDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: 0.3, confidence: 0.3 },
    });
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
    });
    const outcome = await runDecision(SPEC, { billTo: BILL_TO });
    expect(outcome).toMatchObject({
      engine: "llm",
      answers: { priority: { value: "high" } },
      fallbackReason: "jev_low_confidence",
    });
  });

  it("returns null when both engines fail — the use case applies its own degradation", async () => {
    runJevDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue(null);
    const outcome = await runDecision(SPEC, { billTo: BILL_TO });
    expect(outcome).toBeNull();
  });

  it("runs the LLM directly when the kill-switch is off, without touching Jev", async () => {
    getAppConfigValuesMock.mockResolvedValue({ jev_decisions_enabled: "false" });
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
    });
    const outcome = await runDecision(SPEC, { billTo: BILL_TO });
    expect(runJevDecisionMock).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ engine: "llm", fallbackReason: "jev_disabled" });
  });

  it("refuses a malformed spec without calling any engine", async () => {
    const outcome = await runDecision(
      { ...SPEC, state: {} },
      { billTo: BILL_TO }
    );
    expect(outcome).toBeNull();
    expect(runJevDecisionMock).not.toHaveBeenCalled();
    expect(runLlmDecisionMock).not.toHaveBeenCalled();
  });

  it("bills a mixed decision as ONE run with one line per engine, in order", async () => {
    runJevDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
    });
    await runDecision(SPEC, { billTo: BILL_TO, projectId: "project-1" });
    const jevCtx = runJevDecisionMock.mock.calls[0][1];
    const llmCtx = runLlmDecisionMock.mock.calls[0][1];
    expect(jevCtx.runId).toBe(llmCtx.runId);
    expect(jevCtx.seq).toBe(0);
    expect(llmCtx.seq).toBe(1);
    expect(jevCtx.billTo).toEqual(BILL_TO);
    expect(llmCtx.projectId).toBe("project-1");
  });

  it("carries seq 0 to the LLM when it runs directly (no Jev line before it)", async () => {
    getAppConfigValuesMock.mockResolvedValue({ jev_decisions_enabled: "false" });
    runLlmDecisionMock.mockResolvedValue({
      priority: { value: "high", probability: null, confidence: null },
    });
    await runDecision(SPEC, { billTo: BILL_TO });
    expect(runLlmDecisionMock.mock.calls[0][1].seq).toBe(0);
  });
});

describe("loadJevDecisionSettings", () => {
  it("defaults to enabled, floor 0.55, shadow rate 0.05", async () => {
    await expect(loadJevDecisionSettings()).resolves.toEqual({
      enabled: true,
      confidenceFloor: 0.55,
      shadowSampleRate: 0.05,
    });
  });

  it("reads the calibrated values and clamps them into 0–1", async () => {
    getAppConfigValuesMock.mockResolvedValue({
      jev_confidence_floor: "0.7",
      jev_shadow_sample_rate: "0.5",
    });
    await expect(loadJevDecisionSettings()).resolves.toEqual({
      enabled: true,
      confidenceFloor: 0.7,
      shadowSampleRate: 0.5,
    });
    getAppConfigValuesMock.mockResolvedValue({
      jev_confidence_floor: "12",
      jev_shadow_sample_rate: "-3",
    });
    await expect(loadJevDecisionSettings()).resolves.toEqual({
      enabled: true,
      confidenceFloor: 1,
      shadowSampleRate: 0,
    });
  });

  it("reads anything but exactly 'false' as enabled", async () => {
    getAppConfigValuesMock.mockResolvedValue({ jev_decisions_enabled: "false" });
    expect((await loadJevDecisionSettings()).enabled).toBe(false);
    getAppConfigValuesMock.mockResolvedValue({ jev_decisions_enabled: " false " });
    expect((await loadJevDecisionSettings()).enabled).toBe(false);
  });
});

describe("shouldShadowSample", () => {
  it("samples a uniform roll under the rate, and never at rate 0", () => {
    expect(shouldShadowSample(0.05, 0.04)).toBe(true);
    expect(shouldShadowSample(0.05, 0.06)).toBe(false);
    expect(shouldShadowSample(0, 0)).toBe(false);
  });
});
