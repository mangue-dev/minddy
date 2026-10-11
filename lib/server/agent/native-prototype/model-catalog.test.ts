import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ connections: [] as unknown[], row: null as Record<string, unknown> | null, error: null as unknown, discovery: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./access", () => ({ assertNativePrototypeAccess: vi.fn() }));
vi.mock("../native-agent-credentials", () => ({ listNativeConnections: vi.fn(async () => state.connections) }));
vi.mock("./connections", () => ({ discoverNativeCodexModels: state.discovery, NativePrototypeError: class extends Error { constructor(readonly code: string) { super(code); } } }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row, error: state.error }) }) }) }) }) }) }));
import { assertNativeModelPreference, nativeModelCatalog, refreshNativeModelCatalog } from "./model-catalog";
const models = [{ id: "codex-future", displayName: "Future", supportedReasoningEfforts: ["medium", "ultra"], defaultReasoningEffort: "medium", isDefault: true }];
beforeEach(() => { state.connections = [{ id: "connection", engine: "codex", status: "connected", generation: 2, stopRequired: false }]; state.row = { models, connection_id: "connection", connection_generation: 2, updated_at: "2026-10-10T00:00:00Z" }; state.error = null; state.discovery.mockReset(); });
describe("account-owned native model discovery", () => {
  it("reads cached metadata without creating an allocation and rejects old account generations", async () => {
    expect((await nativeModelCatalog("owner", "codex")).models).toEqual(models);
    expect(state.discovery).not.toHaveBeenCalled();
    state.row!.connection_generation = 1;
    expect((await nativeModelCatalog("owner", "codex")).models).toEqual([]);
    state.row!.connection_generation = 2; state.row!.connection_id = "other";
    expect((await nativeModelCatalog("owner", "codex")).models).toEqual([]);
  });
  it("hides stale metadata after disconnect or required cleanup", async () => {
    state.connections = [{ id: "connection", engine: "codex", status: "disconnected", generation: 2 }];
    expect((await nativeModelCatalog("owner", "codex")).models).toEqual([]);
    state.connections = [{ id: "connection", engine: "codex", status: "connected", generation: 2, stopRequired: true }];
    expect((await nativeModelCatalog("owner", "codex")).models).toEqual([]);
  });
  it("requires discovered supported model and effort combinations but permits automatic defaults", async () => {
    await expect(assertNativeModelPreference("owner", "codex", { model: "codex-future", reasoningEffort: "ultra" })).resolves.toBeUndefined();
    await expect(assertNativeModelPreference("owner", "codex", { model: null, reasoningEffort: "medium" })).resolves.toBeUndefined();
    await expect(assertNativeModelPreference("owner", "codex", { model: "unavailable", reasoningEffort: null })).rejects.toThrow("profile_invalid");
    await expect(assertNativeModelPreference("owner", "codex", { model: "codex-future", reasoningEffort: "high" })).rejects.toThrow("profile_invalid");
    state.connections = [];
    await expect(assertNativeModelPreference("owner", "codex", { model: null, reasoningEffort: null })).resolves.toBeUndefined();
  });
  it("refreshes Codex only explicitly and leaves Claude live eligibility unverified", async () => {
    await refreshNativeModelCatalog("owner", "codex"); expect(state.discovery).toHaveBeenCalledExactlyOnceWith("owner");
    state.discovery.mockClear();
    expect((await refreshNativeModelCatalog("owner", "claude_code")).source).toBe("aliases");
    expect(state.discovery).not.toHaveBeenCalled();
  });
});
