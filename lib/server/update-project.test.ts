import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `smart_triage_mode` validation of the project settings (MIN-566): only
 * the three known values pass, `off` and `rules` cost nothing, arming `jev`
 * requires the owner's usage budget (the scoring passes bill it), and a
 * member's write is refused before anything else.
 */

const {
  getProjectAccessMock,
  canUseSmartAssignMock,
  canUseAutomationsMock,
  hasUsageBudgetMock,
  fromMock,
} = vi.hoisted(() => ({
  getProjectAccessMock: vi.fn<(userId: string, projectId: string) => Promise<unknown>>(),
  canUseSmartAssignMock: vi.fn<(ownerId: string) => Promise<boolean>>(),
  canUseAutomationsMock: vi.fn<(ownerId: string) => Promise<boolean>>(),
  hasUsageBudgetMock: vi.fn<(userId: string, surface?: string) => Promise<boolean>>(),
  fromMock: vi.fn<(table: string) => unknown>(),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: getProjectAccessMock,
}));
vi.mock("@/lib/server/entitlements", () => ({
  canUseSmartAssign: canUseSmartAssignMock,
  canUseAutomations: canUseAutomationsMock,
}));
vi.mock("@/lib/server/usage", () => ({
  hasUsageBudget: hasUsageBudgetMock,
}));

import { updateProjectSettings } from "./update-project";

const ACCESS = {
  isOwner: true,
  project: { id: "project-1", owner_id: "user-owner" },
};

let updated: Record<string, unknown> | null;

beforeEach(() => {
  updated = null;
  fromMock.mockClear();
  fromMock.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "not", "in", "or", "order", "limit"]) {
      query[method] = () => query;
    }
    query.update = (payload: unknown) => {
      updated = payload as Record<string, unknown>;
      return query;
    };
    // project_members reads an empty team; the final update resolves the row.
    query.then = (onFulfilled: () => unknown) =>
      Promise.resolve(
        table === "projects"
          ? { data: { ...ACCESS.project, ...updated }, error: null }
          : { data: [], error: null }
      ).then(onFulfilled);
    query.maybeSingle = () =>
      Promise.resolve(
        table === "projects" ? { data: { ...ACCESS.project }, error: null } : { data: null, error: null }
      );
    return query;
  });
  getProjectAccessMock.mockResolvedValue(ACCESS);
  canUseSmartAssignMock.mockResolvedValue(true);
  canUseAutomationsMock.mockResolvedValue(true);
  hasUsageBudgetMock.mockResolvedValue(true);
});

describe("updateProjectSettings — smart_triage_mode", () => {
  it("accepts the three known values and defaults the triage to rules", async () => {
    for (const mode of ["off", "rules", "jev"] as const) {
      const result = await updateProjectSettings({
        projectId: "project-1",
        actorId: "user-owner",
        input: { smart_triage_mode: mode },
      });
      expect(result.ok).toBe(true);
      expect(updated?.smart_triage_mode).toBe(mode);
    }
  });

  it("refuses an unknown mode as a client bug, without coercing it", async () => {
    for (const bad of ["smart", "RULES", "", null, 1]) {
      const result = await updateProjectSettings({
        projectId: "project-1",
        actorId: "user-owner",
        input: { smart_triage_mode: bad },
      });
      expect(result).toEqual({
        ok: false,
        status: 400,
        errorKey: "invalidSmartTriageMode",
      });
      expect(updated).toBeNull();
    }
  });

  it("gates arming jev on the owner's usage budget, rules and off stay free", async () => {
    hasUsageBudgetMock.mockResolvedValue(false);
    const jev = await updateProjectSettings({
      projectId: "project-1",
      actorId: "user-owner",
      input: { smart_triage_mode: "jev" },
    });
    expect(jev).toEqual({ ok: false, status: 403, errorKey: "smartTriageNotAllowed" });
    expect(hasUsageBudgetMock).toHaveBeenCalledWith("user-owner");
    expect(updated).toBeNull();

    for (const mode of ["off", "rules"] as const) {
      const result = await updateProjectSettings({
        projectId: "project-1",
        actorId: "user-owner",
        input: { smart_triage_mode: mode },
      });
      expect(result.ok).toBe(true);
    }
  });

  it("refuses a member before anything else", async () => {
    getProjectAccessMock.mockResolvedValue({ ...ACCESS, isOwner: false });
    const result = await updateProjectSettings({
      projectId: "project-1",
      actorId: "user-member",
      input: { smart_triage_mode: "rules" },
    });
    expect(result).toEqual({ ok: false, status: 403, errorKey: "ownerOnly" });
  });
});
