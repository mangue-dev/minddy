import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  auth: vi.fn(), select: vi.fn(), lookup: vi.fn(), latest: vi.fn(), service: vi.fn(),
  decodeProject: vi.fn(), estimate: vi.fn(), simulate: vi.fn(),
}));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: state.auth }));
vi.mock("@/lib/server/issue-store", () => ({
  issueStore: (client: unknown) => ({ select: (projection: string) => {
    state.select(client, projection);
    return { eq: (column: string, id: string) => ({ maybeSingle: () => state.lookup(column, id) }) };
  } }),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: state.service }));
vi.mock("@/lib/server/project-content", () => ({ decodeProject: state.decodeProject }));
vi.mock("@/lib/server/agent/runs", () => ({ activeRunForChain: vi.fn(), requestInterrupt: vi.fn() }));
vi.mock("@/lib/server/numo/turns", () => ({ requestNumoTurnStop: vi.fn() }));
vi.mock("@/lib/server/automations/chain", () => ({
  latestChainForIssue: state.latest, activeNumoAutomationOperation: vi.fn(),
  cancelPendingChain: vi.fn(), lastNumoAutomationOperation: vi.fn(),
  lastRunOfChain: vi.fn(), resumeChain: vi.fn(),
}));
vi.mock("@/lib/server/automations/report", () => ({ haltChain: vi.fn() }));
vi.mock("@/lib/server/automations/engine", () => ({ scheduleAutomations: vi.fn() }));
vi.mock("@/lib/server/automations/estimate", () => ({ estimateChainCost: state.estimate }));
vi.mock("@/lib/automations", async (original) => ({
  ...await original<object>(), simulateChain: state.simulate,
  simulatedRunModes: () => ["implement"],
}));
const { GET } = await import("@/app/api/issues/[id]/automation/route");
const client = { caller: "authorized-user" };
const params = { params: Promise.resolve({ id: "issue-1" }) };
const request = (query = "?view=chain") => new NextRequest(`https://minddy.app/api/issues/issue-1/automation${query}`);
const chain = {
  id: "chain-1", status: "awaiting_human", preset: "review", step: 2, retries: 0,
  stop_reason: null, not_before: null, created_at: "2026-10-01", updated_at: "2026-10-02",
  private_prompt: "Must never enter the public response",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.auth.mockResolvedValue({ ok: true, user: { id: "user-1" }, supabase: client });
  state.lookup.mockResolvedValue({ data: { id: "issue-1", project_id: "project-1", status: "backlog", priority: "none", effort: null, plan: null, assignee_id: null, automation_override: null } });
  state.latest.mockResolvedValue(chain);
  state.service.mockReturnValue({
    from: (table: string) => ({ select: () => ({ eq: () => table === "projects"
      ? { maybeSingle: async () => ({ data: { id: "project-1", owner_id: "owner-1", automations_enabled: true } }) }
      : Promise.resolve({ data: [] }) }) }),
    auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: {} } } }) } },
  });
  state.decodeProject.mockImplementation(async (row) => row);
  state.simulate.mockReturnValue([{ mode: "implement" }]);
  state.estimate.mockResolvedValue({ shareOfMonthlyBudget: 0.02, fromHistory: true });
});
describe("authorized issue chain status reads", () => {
  it("returns current public chain state without decrypting simulation inputs", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ chain: {
      id: "chain-1", status: "awaiting_human", preset: "review", step: 2, retries: 0,
      stopReason: null, notBefore: null, createdAt: "2026-10-01", updatedAt: "2026-10-02",
    } });
    expect(state.select).toHaveBeenCalledWith(client, "id, project_id");
    expect(state.latest).toHaveBeenCalledWith("issue-1");
    expect(state.service).not.toHaveBeenCalled();
    expect(state.decodeProject).not.toHaveBeenCalled();
    expect(state.simulate).not.toHaveBeenCalled();
    expect(state.estimate).not.toHaveBeenCalled();
  });
  it("does not read a chain when issue RLS denies visibility, including revocation", async () => {
    await GET(request(), params);
    state.lookup.mockResolvedValue({ data: null });
    const response = await GET(request(), params);
    expect(response.status).toBe(404);
    expect(state.latest).toHaveBeenCalledTimes(1);
  });
  it("stops before any repository read for an unauthenticated caller", async () => {
    state.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await GET(request(), params)).status).toBe(401);
    expect(state.select).not.toHaveBeenCalled();
    expect(state.latest).not.toHaveBeenCalled();
  });
  it("reads a changed or absent chain again instead of caching its state", async () => {
    state.latest.mockResolvedValueOnce(chain).mockResolvedValueOnce({ ...chain, status: "completed" }).mockResolvedValueOnce(null);
    expect((await (await GET(request(), params)).json()).chain.status).toBe("awaiting_human");
    expect((await (await GET(request(), params)).json()).chain.status).toBe("completed");
    expect(await (await GET(request(), params)).json()).toEqual({ chain: null });
  });
  it("preserves the full launch simulation and encrypted input path by default", async () => {
    const response = await GET(request(""), params);
    expect(await response.json()).toMatchObject({ enabled: true, plannedModes: ["implement"], estimate: { shareOfMonthlyBudget: 0.02, fromHistory: true } });
    expect(state.select.mock.calls[0][1]).toContain("plan, assignee_id, automation_override");
    expect(state.decodeProject).toHaveBeenCalled();
    expect(state.simulate).toHaveBeenCalled();
    expect(state.estimate).toHaveBeenCalled();
  });
});
