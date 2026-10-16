import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The network half of the decision-model adapter (MIN-694): which model is
 * called, which model is recorded, and the fixed failure code of each way a
 * call can go wrong. The transport, the ledger and the key resolution are
 * mocked; the body mapping and the parsing are the real ones.
 */

const { fetchAiProviderMock, recordAiUsageMock, resolveConfiguredModelMock, getUserByokMock } =
  vi.hoisted(() => ({
    fetchAiProviderMock: vi.fn(),
    recordAiUsageMock: vi.fn(),
    resolveConfiguredModelMock: vi.fn(),
    getUserByokMock: vi.fn(),
  }));

vi.mock("@/lib/server/ai-provider-request", () => ({ fetchAiProvider: fetchAiProviderMock }));
vi.mock("@/lib/server/ai-usage", () => ({
  recordAiUsage: recordAiUsageMock,
  parseOpenRouterUsage: (usage: { input_tokens?: number; cost?: number } | undefined) => ({
    promptTokens: usage?.input_tokens ?? 0,
    completionTokens: 0,
    totalTokens: usage?.input_tokens ?? 0,
    cost: usage?.cost ?? null,
  }),
}));
vi.mock("@/lib/server/model-config", () => ({ resolveConfiguredModel: resolveConfiguredModelMock }));
vi.mock("@/lib/server/agent/model", () => ({ getUserByok: getUserByokMock }));
vi.mock("@/lib/managed-services", () => ({ isManagedAiEnabled: () => true }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));

const { callDecisionModel, probeDecisionModel, runModelDecision, DECISION_MODEL_PROBE_SPEC } =
  await import("./decision-model");
import type { DecisionSpec } from "./types";

const SPEC: DecisionSpec = {
  useCase: "smart_fill",
  state: { issue: { title: "t" } },
  questions: [
    {
      key: "priority",
      kind: "single_choice",
      label: "priority",
      options: [
        { value: "high", label: "high" },
        { value: "low", label: "low" },
      ],
    },
  ],
  llm: { toolName: "fill_issue", parameters: {}, systemPrompt: "s", userMessage: "u" },
};

const CTX = { runId: "run-1", seq: 0, billTo: { userId: "user-1" } } as const;

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "platform-key";
  fetchAiProviderMock.mockReset();
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
  resolveConfiguredModelMock.mockReset().mockResolvedValue({ model: "liquid/d1" });
  getUserByokMock.mockReset().mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("callDecisionModel", () => {
  it("calls the configured global model and records the versioned model that answered", async () => {
    fetchAiProviderMock.mockResolvedValue(
      respond({
        model: "liquid/d1-20260930",
        id: "gen-dec-1",
        answers: { priority: { choice: "high", probabilities: { high: 0.9 }, confidence: 0.8 } },
        usage: { input_tokens: 100, output_tokens: 0, cost: 0.000002 },
      })
    );
    const result = await callDecisionModel(SPEC, CTX);
    expect(resolveConfiguredModelMock).toHaveBeenCalledWith("jev_model");
    const [url, init] = fetchAiProviderMock.mock.calls[0].slice(1) as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "liquid/d1" });
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "jev_decision",
        model: "liquid/d1-20260930",
        generationId: "gen-dec-1",
        cost: 0.000002,
        keyMode: "platform",
      })
    );
    expect(result).toEqual({
      ok: true,
      model: "liquid/d1-20260930",
      answers: { priority: { value: "high", probability: 0.9, confidence: 0.8 } },
    });
  });

  it("reports an HTTP refusal (a retired or unknown model) without recording usage", async () => {
    fetchAiProviderMock.mockResolvedValue(respond({ error: { message: "not found" } }, 404));
    await expect(callDecisionModel(SPEC, CTX)).resolves.toEqual({
      ok: false,
      reason: "http",
      status: 404,
    });
    expect(recordAiUsageMock).not.toHaveBeenCalled();
  });

  it("reports a timeout distinctly from a network failure", async () => {
    fetchAiProviderMock.mockRejectedValueOnce(
      Object.assign(new Error("timed out"), { name: "TimeoutError" })
    );
    await expect(callDecisionModel(SPEC, CTX)).resolves.toEqual({ ok: false, reason: "timeout" });
    fetchAiProviderMock.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(callDecisionModel(SPEC, CTX)).resolves.toEqual({ ok: false, reason: "network" });
  });

  it("reads a non-JSON success body as an invalid response, not a network failure", async () => {
    fetchAiProviderMock.mockResolvedValue(new Response("<html>gateway</html>", { status: 200 }));
    await expect(callDecisionModel(SPEC, CTX)).resolves.toEqual({
      ok: false,
      reason: "invalid_response",
    });
  });

  it("logs failures with a constant format string, the model id only as a value", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchAiProviderMock.mockRejectedValueOnce(new Error("reset"));
    await callDecisionModel(SPEC, CTX, { model: "evil/%s%o" });
    fetchAiProviderMock.mockResolvedValueOnce(respond({ error: "no" }, 400));
    await callDecisionModel(SPEC, CTX, { model: "evil/%s%o" });
    for (const [format, ...values] of error.mock.calls) {
      expect(format).not.toContain("evil/");
      expect(values).toContain("evil/%s%o");
    }
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("records a paid but unusable answer, then refuses it", async () => {
    fetchAiProviderMock.mockResolvedValue(
      respond({ model: "x/decider", answers: { priority: { choice: "urgent" } }, usage: {} })
    );
    await expect(callDecisionModel(SPEC, CTX)).resolves.toEqual({
      ok: false,
      reason: "invalid_response",
    });
    expect(recordAiUsageMock).toHaveBeenCalledTimes(1);
  });

  it("fails without a call when no OpenRouter key can carry it", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(callDecisionModel(SPEC, CTX)).resolves.toEqual({ ok: false, reason: "no_key" });
    expect(fetchAiProviderMock).not.toHaveBeenCalled();
  });

  it("uses the payer's OpenRouter BYOK key when one exists", async () => {
    getUserByokMock.mockResolvedValue({
      provider: "openrouter",
      apiKey: "byok-key",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    fetchAiProviderMock.mockResolvedValue(
      respond({ model: "liquid/d1", answers: { priority: { choice: "low" } }, usage: {} })
    );
    await callDecisionModel(SPEC, CTX);
    const init = fetchAiProviderMock.mock.calls[0][2] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer byok-key");
    expect(recordAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({ keyMode: "byok" }));
  });
});

describe("runModelDecision", () => {
  it("returns null on any failure, for the runner's fallback", async () => {
    fetchAiProviderMock.mockResolvedValue(respond({}, 502));
    await expect(runModelDecision(SPEC, CTX)).resolves.toBeNull();
  });
});

describe("probeDecisionModel", () => {
  it("test-calls the candidate, not the configured model, on the platform's account", async () => {
    const answers: Record<string, unknown> = Object.fromEntries(
      Object.keys(
        (await import("./decision-model")).expandDecisionQuestions(DECISION_MODEL_PROBE_SPEC)
      ).map((key) => [key, key.includes(":") || key === "is_junk" ? 0.2 : { choice: "__none__" }])
    );
    answers.priority = { choice: "urgent", confidence: 0.9 };
    answers.objective_id = { choice: "auth", confidence: 0.9 };
    fetchAiProviderMock.mockResolvedValue(
      respond({ model: "perplexity/pplx-decider-v1.1-27b-20261006", answers, usage: {} })
    );
    const result = await probeDecisionModel("perplexity/pplx-decider-v1.1-27b", "run-probe");
    expect(resolveConfiguredModelMock).not.toHaveBeenCalled();
    const init = fetchAiProviderMock.mock.calls[0][2] as RequestInit;
    expect(JSON.parse(String(init.body)).model).toBe("perplexity/pplx-decider-v1.1-27b");
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-probe",
        billTo: { platform: "decision model compatibility check" },
      })
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("fails a candidate whose provider refuses Minddy's state", async () => {
    fetchAiProviderMock.mockResolvedValue(respond({ error: { message: "state must be" } }, 400));
    await expect(probeDecisionModel("respan/span-01", "run-probe")).resolves.toEqual({
      ok: false,
      reason: "http",
      status: 400,
    });
  });
});
