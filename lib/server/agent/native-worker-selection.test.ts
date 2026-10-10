import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), list: vi.fn(), enabled: vi.fn(), validate: vi.fn(),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: h.from }) }));
vi.mock("./native-prototype/model-catalog", () => ({ assertNativeModelPreference: h.validate }));
vi.mock("./native-agent-credentials", () => ({ listNativeConnections: h.list }));
vi.mock("./native-prototype/access", () => ({ nativePrototypeEnabledFor: h.enabled }));
const { resolveWorkerHarness, NativeWorkerUnavailableError } = await import("./native-worker-selection");
const connected = { id: "connection", engine: "codex", status: "connected", generation: 7,
  busy: false, stopRequired: false, revision: 30, updatedAt: "2026-10-10" };

beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: h.select, eq: h.eq, maybeSingle: h.maybeSingle };
  h.from.mockReturnValue(query); h.select.mockReturnValue(query); h.eq.mockReturnValue(query);
  h.maybeSingle.mockResolvedValue({ data: { default_engine: "codex" }, error: null });
  h.list.mockResolvedValue([connected]); h.enabled.mockReturnValue(true);
});

describe("native code-worker account selection", () => {
  it("freezes the selected native connection identity and generation from owner metadata", async () => {
    await expect(resolveWorkerHarness("owner")).resolves.toEqual({
      engine: "codex", nativeConnectionId: "connection", nativeConnectionGeneration: 7, nativeModel: null, nativeReasoningEffort: null,
    });
    expect(h.from).toHaveBeenCalledWith("user_agent_preferences");
    expect(h.select).toHaveBeenCalledWith("default_engine,native_model_preferences");
    expect(h.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(h.list).toHaveBeenCalledWith("owner");
  });

  it("selects Claude subscription metadata independently of API model settings", async () => {
    h.maybeSingle.mockResolvedValue({ data: { default_engine: "claude_code" }, error: null });
    h.list.mockResolvedValue([{ ...connected, engine: "claude_code", id: "claude-connection" }]);
    await expect(resolveWorkerHarness("owner")).resolves.toEqual({
      engine: "claude_code", nativeConnectionId: "claude-connection", nativeConnectionGeneration: 7, nativeModel: null, nativeReasoningEffort: null,
    });
    expect(h.select).not.toHaveBeenCalledWith(expect.stringMatching(/default_model/));
  });

  it("allows a busy connected account to queue without reallocating or switching engines", async () => {
    h.list.mockResolvedValue([{ ...connected, busy: true }]);
    await expect(resolveWorkerHarness("owner")).resolves.toMatchObject({ engine: "codex", nativeConnectionId: "connection" });
  });

  it("keeps a frozen native run bound to its launch engine despite later account preferences", async () => {
    h.maybeSingle.mockResolvedValue({ data: { default_engine: "opencode" }, error: null });
    await expect(resolveWorkerHarness("owner", {
      agent_engine: "codex", native_connection_id: "connection", native_connection_generation: 7,
    })).resolves.toEqual({ engine: "codex", nativeConnectionId: "connection", nativeConnectionGeneration: 7, nativeModel: null, nativeReasoningEffort: null });
    expect(h.from).not.toHaveBeenCalled();
  });

  it("freezes engine-specific model and effort without consuming API preferences", async () => {
    h.maybeSingle.mockResolvedValue({ data: { default_engine: "codex", default_model: "api/ignored",
      native_model_preferences: { codex: { model: "gpt-test-codex", reasoningEffort: "ultra" } } }, error: null });
    await expect(resolveWorkerHarness("owner")).resolves.toMatchObject({
      nativeModel: "gpt-test-codex", nativeReasoningEffort: "ultra" });
    expect(h.validate).toHaveBeenCalledWith("owner", "codex", { model: "gpt-test-codex", reasoningEffort: "ultra" });
    h.validate.mockRejectedValue(new Error("catalog unavailable"));
    await expect(resolveWorkerHarness("owner")).rejects.toMatchObject({ code: "private_prototype_unavailable" });
  });

  it("retains frozen model and effort after catalog or preferences change", async () => {
    h.validate.mockRejectedValue(new Error("catalog no longer contains the model"));
    await expect(resolveWorkerHarness("owner", { agent_engine: "codex", model: "codex/gpt-test-codex",
      native_reasoning_effort: "xhigh", native_connection_id: "connection", native_connection_generation: 7,
    })).resolves.toMatchObject({ nativeModel: "gpt-test-codex", nativeReasoningEffort: "xhigh" });
    expect(h.validate).not.toHaveBeenCalled(); expect(h.from).not.toHaveBeenCalled();
    await expect(resolveWorkerHarness("owner", { agent_engine: "codex", model: "claude_code/sonnet",
      native_connection_id: "connection", native_connection_generation: 7,
    })).rejects.toThrow("Invalid frozen native model");
  });

  it("requires reconnection for missing, disconnected, stopped or superseded credentials with no fallback", async () => {
    for (const rows of [[], [{ ...connected, status: "disconnected" }], [{ ...connected, stopRequired: true }]]) {
      h.list.mockResolvedValue(rows);
      await expect(resolveWorkerHarness("owner")).rejects.toMatchObject({ code: "reconnect_required" });
    }
    h.list.mockResolvedValue([connected]);
    for (const binding of [{ native_connection_id: "replacement", native_connection_generation: 7 },
      { native_connection_id: "connection", native_connection_generation: 6 },
      { native_connection_id: null, native_connection_generation: null }]) {
      await expect(resolveWorkerHarness("owner", { agent_engine: "codex", ...binding })).rejects.toBeInstanceOf(NativeWorkerUnavailableError);
    }
  });

  it("denies native selection outside the private hosted preview instead of resolving an API worker", async () => {
    h.enabled.mockReturnValue(false);
    await expect(resolveWorkerHarness("owner")).rejects.toMatchObject({ code: "private_prototype_unavailable" });
    expect(h.list).not.toHaveBeenCalled();
  });

  it("fails closed on preference or vault metadata database errors", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    await expect(resolveWorkerHarness("owner")).rejects.toThrow("Unable to read account worker harness");
    expect(h.list).not.toHaveBeenCalled();
    h.maybeSingle.mockResolvedValue({ data: { default_engine: "codex" }, error: null });
    h.list.mockRejectedValue(new Error("vault unavailable"));
    await expect(resolveWorkerHarness("owner")).rejects.toThrow("vault unavailable");
  });

  it("preserves explicit OpenCode and defaults only an absent preference to OpenCode", async () => {
    for (const row of [null, { default_engine: "opencode" }]) {
      h.maybeSingle.mockResolvedValue({ data: row, error: null });
      await expect(resolveWorkerHarness("owner")).resolves.toEqual({ engine: "opencode" });
    }
    expect(h.list).not.toHaveBeenCalled();
    h.maybeSingle.mockResolvedValue({ data: { default_engine: "unknown" }, error: null });
    await expect(resolveWorkerHarness("owner")).rejects.toMatchObject({ code: "reconnect_required" });
  });
});
