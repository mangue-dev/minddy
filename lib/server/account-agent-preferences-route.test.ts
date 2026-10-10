import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), save: vi.fn(), validateModel: vi.fn(), row: {} as Record<string, unknown> }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: h.auth }));
vi.mock("@/lib/server/agent/native-agent-credentials", () => ({ listNativeConnections: h.list }));
vi.mock("@/lib/server/agent/native-prototype/model-catalog", () => ({ assertNativeModelPreference: h.validateModel }));
vi.mock("@/lib/server/agent/branch-prefix-content", () => ({
  saveAgentPreferences: h.save, decodeAgentBranchPrefix: async () => "numo",
}));
vi.mock("@/lib/server/agent/model", () => ({ getUserByok: vi.fn() }));
vi.mock("@/lib/server/agent/model-plan", () => ({ ensureModelInPlan: vi.fn() }));
import { GET, PUT } from "@/app/api/account/agent-preferences/route";
const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }) }) }) };
function put(value: unknown) {
  return PUT(new NextRequest("http://localhost:6463/api/account/agent-preferences", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
  }));
}
beforeEach(() => {
  vi.clearAllMocks();
  h.row = { default_engine: "opencode", default_model: "provider/model", default_reasoning_level: "high", branch_prefix: "numo", sandbox_region: "eu", sandbox_size: "standard" };
  h.auth.mockResolvedValue({ ok: true, user: { id: "owner" }, supabase });
  h.save.mockImplementation(async (_owner, fields) => ({ ...h.row, ...fields }));
  h.list.mockResolvedValue([]);
  h.validateModel.mockResolvedValue(undefined);
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE", "true");
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE_USER_IDS", "owner");
});
afterEach(() => vi.unstubAllEnvs());

it("preserves a selected native engine when eligibility is revoked without reading credentials", async () => {
  h.row.default_engine = "codex";
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE", "false");
  const result = await GET(new NextRequest("http://localhost:6463/api/account/agent-preferences"));
  expect(await result.json()).toMatchObject({ default_engine: "codex", native_agents_enabled: false });
  expect(h.list).not.toHaveBeenCalled();
});

it("selects a desired native agent with a partial owner-bound write before connection", async () => {
  h.list.mockResolvedValue([{ engine: "codex", status: "connected", busy: true, stopRequired: false }]);
  const result = await put({ default_engine: "codex", user_id: "attacker", native_agents_enabled: true });
  expect(result.status).toBe(200);
  expect(h.list).not.toHaveBeenCalled();
  expect(h.save).toHaveBeenCalledWith("owner", { default_engine: "codex" }, supabase);
  expect(await result.json()).toMatchObject({ default_engine: "codex", default_model: "provider/model", default_reasoning_level: "high" });
});

it.each([undefined, { engine: "codex", status: "disconnected" }, { engine: "codex", status: "connected", stopRequired: true }])("preserves deliberate native selection independently of connection readiness", async (metadata) => {
  h.list.mockResolvedValue(metadata ? [metadata] : []);
  const result = await put({ default_engine: "codex" });
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ default_engine: "codex" });
  expect(h.save).toHaveBeenCalledWith("owner", { default_engine: "codex" }, supabase);
  expect(h.list).not.toHaveBeenCalled();
});

it("rejects client-forged eligibility and unknown engines before profile access", async () => {
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE_USER_IDS", "other");
  const denied = await put({ default_engine: "claude_code", native_agents_enabled: true });
  expect(denied.status).toBe(403);
  expect(await denied.json()).toEqual({ errorCode: "private_prototype_unavailable" });
  expect((await put({ default_engine: "loop" })).status).toBe(400);
  expect(h.list).not.toHaveBeenCalled();
  expect(h.save).not.toHaveBeenCalled();
});

it("allows explicit OpenCode recovery while native preview is disabled", async () => {
  h.row.default_engine = "claude_code";
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE", "false");
  expect((await put({ default_engine: "opencode" })).status).toBe(200);
  expect(h.save).toHaveBeenCalledWith("owner", { default_engine: "opencode" }, supabase);
  expect(h.list).not.toHaveBeenCalled();
});

it("retains the existing authentication denial before preference or native operations", async () => {
  h.auth.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
  expect((await put({ default_engine: "codex" })).status).toBe(401);
  expect(h.list).not.toHaveBeenCalled();
  expect(h.save).not.toHaveBeenCalled();
});

it("validates native choices for the authenticated owner and saves only the supplied engine", async () => {
  const preference = { model: "gpt-native", reasoningEffort: "ultra" };
  const result = await put({ user_id: "attacker", native_model_preferences: { codex: preference } });
  expect(result.status).toBe(200);
  expect(h.validateModel).toHaveBeenCalledWith("owner", "codex", preference);
  expect(h.save).toHaveBeenCalledWith("owner", { native_model_preferences: { codex: preference } }, supabase);
});

it("rejects a catalog mismatch without exposing provider errors or changing settings", async () => {
  h.validateModel.mockRejectedValue(new Error("private provider transcript"));
  const result = await put({ native_model_preferences: { codex: { model: "retired", reasoningEffort: "high" } } });
  expect(result.status).toBe(400);
  expect(await result.json()).toEqual({ errorCode: "profile_invalid" });
  expect(h.save).not.toHaveBeenCalled();
});

it("rejects forged engines and cross-engine thinking before model discovery", async () => {
  const value = { model: "sonnet", reasoningEffort: "ultra" };
  expect((await put({ native_model_preferences: { claude_code: value } })).status).toBe(400);
  expect((await put({ native_model_preferences: { opencode: value } })).status).toBe(400);
  expect(h.validateModel).not.toHaveBeenCalled();
  expect(h.save).not.toHaveBeenCalled();
});
