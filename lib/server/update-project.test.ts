import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getProjectAccessMock,
  canUseSmartAssignMock,
  canUseAutomationsMock,
  hasUsageBudgetMock,
  fromMock,
  readAiInstructionsMock,
  writeAiInstructionsMock,
} = vi.hoisted(() => ({
  readAiInstructionsMock: vi.fn<() => Promise<Record<string, string>>>(),
  writeAiInstructionsMock: vi.fn<(...args: unknown[]) => Promise<Record<string, string>>>(),
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

vi.mock("@/lib/server/ai-instructions", () => ({
  readAiInstructions: readAiInstructionsMock,
  writeAiInstructions: writeAiInstructionsMock,
}));

import { updateProjectSettings } from "./update-project";

const ACCESS = {
  isOwner: true,
  project: { id: "project-1", owner_id: "user-owner", name: "Project",
    automations: [], smart_assign_rules: {} },
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
  readAiInstructionsMock.mockReset().mockResolvedValue({});
  writeAiInstructionsMock.mockReset().mockImplementation(async (...args) => args[3] as Record<string, string>);
});

describe("updateProjectSettings — working language and AI instructions (MIN-988)", () => {
  const update = (input: Record<string, unknown>) =>
    updateProjectSettings({ projectId: "project-1", actorId: "user-owner", input });

  it("normalizes the working language and clears it with null", async () => {
    expect((await update({ ai_language: "EN" })).ok).toBe(true);
    expect(updated?.ai_language).toBe("en");
    expect((await update({ ai_language: null })).ok).toBe(true);
    expect(updated?.ai_language).toBeNull();
  });

  it("refuses an unknown language instead of reading it as 'clear'", async () => {
    expect(await update({ ai_language: "English" })).toEqual({
      ok: false, status: 400, errorKey: "invalidAiLanguage",
    });
    expect(updated).toBeNull();
  });

  it("merges a partial instruction update without writing the project row", async () => {
    readAiInstructionsMock.mockResolvedValue({ title: "In English", properties: "Old rule" });
    const result = await update({ ai_instructions: { properties: "Payment bugs are at least high", title: "" } });
    expect(writeAiInstructionsMock).toHaveBeenCalledWith(
      expect.anything(), "project-1", "user-owner", { properties: "Payment bugs are at least high" });
    expect(updated).toBeNull();
    expect(result).toMatchObject({
      ok: true,
      project: { ai_instructions: { properties: "Payment bugs are at least high" } },
    });
  });

  it("leaves the instructions to the owner alone", async () => {
    getProjectAccessMock.mockResolvedValue({ ...ACCESS, isOwner: false });
    expect(await update({ ai_instructions: { title: "In English" } })).toEqual({
      ok: false, status: 403, errorKey: "ownerOnly",
    });
    expect(readAiInstructionsMock).not.toHaveBeenCalled();
    expect(writeAiInstructionsMock).not.toHaveBeenCalled();
  });

  it("does not report a saved instruction when the write fails", async () => {
    writeAiInstructionsMock.mockRejectedValue(new Error("down"));
    expect(await update({ ai_instructions: { title: "In English" } })).toEqual({
      ok: false, status: 500, errorKey: "databaseError",
    });
  });
});

describe("updateProjectSettings — smart_triage_mode", () => {
  it("accepts deterministic rules", async () => {
    for (const mode of ["rules"] as const) {
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
    for (const bad of ["jev", "off", "smart", "RULES", "", null, 1]) {
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

  it("keeps rules available with an exhausted AI budget", async () => {
    hasUsageBudgetMock.mockResolvedValue(false);
    const result = await updateProjectSettings({ projectId: "project-1", actorId: "user-owner", input: { smart_triage_mode: "rules" } });
    expect(result.ok).toBe(true);
    expect(hasUsageBudgetMock).not.toHaveBeenCalled();
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

describe("updateProjectSettings — smart_assign_from_status (MIN-957)", () => {
  const patch = (input: Record<string, unknown>) =>
    updateProjectSettings({ projectId: "project-1", actorId: "user-owner", input });

  it("accepts the two start statuses", async () => {
    for (const status of ["backlog", "todo"]) {
      const result = await patch({ smart_assign_from_status: status });
      expect(result.ok).toBe(true);
      expect(updated).toMatchObject({ smart_assign_from_status: status });
    }
  });

  it("refuses any other status, in progress included", async () => {
    for (const status of ["in_progress", "triage", "", null]) {
      const result = await patch({ smart_assign_from_status: status });
      expect(result).toMatchObject({ ok: false, status: 400, errorKey: "invalidSmartAssignFromStatus" });
    }
    expect(updated).toBeNull();
  });

  it("restarts the covered period when an active project goes back to backlog", async () => {
    getProjectAccessMock.mockResolvedValue({
      ...ACCESS,
      project: { ...ACCESS.project, smart_assign_enabled: true, smart_assign_from_status: "todo" },
    });
    await patch({ smart_assign_from_status: "backlog" });
    expect(updated).toMatchObject({ smart_assign_enabled_at: expect.any(String) });
  });

  it("leaves that date alone when the setting is raised, unchanged, or Smart Assign is off", async () => {
    getProjectAccessMock.mockResolvedValue({
      ...ACCESS,
      project: { ...ACCESS.project, smart_assign_enabled: true, smart_assign_from_status: "backlog" },
    });
    await patch({ smart_assign_from_status: "todo" });
    expect(updated).not.toHaveProperty("smart_assign_enabled_at");
    await patch({ smart_assign_from_status: "backlog" });
    expect(updated).not.toHaveProperty("smart_assign_enabled_at");

    getProjectAccessMock.mockResolvedValue({
      ...ACCESS,
      project: { ...ACCESS.project, smart_assign_enabled: false, smart_assign_from_status: "todo" },
    });
    await patch({ smart_assign_from_status: "backlog" });
    expect(updated).not.toHaveProperty("smart_assign_enabled_at");
  });

  it("is refused to a member", async () => {
    getProjectAccessMock.mockResolvedValue({ ...ACCESS, isOwner: false });
    const result = await patch({ smart_assign_from_status: "todo" });
    expect(result).toMatchObject({ ok: false, status: 403, errorKey: "ownerOnly" });
  });
});
