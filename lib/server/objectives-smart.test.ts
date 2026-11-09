import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Objective creation with Smart Fill and Smart Assign (MIN-919): the passes
 * only complete what the author left empty, the activity names what they
 * wrote, and clearing a lead on a Smart Assign project asks for a new one.
 * The AI passes are mocked; the write path is the real one.
 */

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  insertEvents: vi.fn(async () => undefined),
  getProjectAccess: vi.fn(),
  resolvePayer: vi.fn(),
  runFill: vi.fn(),
  suggestLead: vi.fn(),
  scheduleRefill: vi.fn(),
  objectiveSelect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ is: () => ({ eq: () => ({ maybeSingle: mocks.objectiveSelect }) }) }),
    }),
  }),
}));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: mocks.getProjectAccess }));
vi.mock("@/lib/server/tenancy", () => ({ userCanBeAssigned: vi.fn(async () => true) }));
vi.mock("@/lib/server/objective-store", () => ({
  encodeObjective: vi.fn(async (row: Record<string, unknown>) => row),
  decodeObjective: vi.fn(async (row: Record<string, unknown>) => row),
}));
vi.mock("@/lib/server/issue-events", () => ({
  buildObjectiveFieldChangeEvents: vi.fn(() => []),
  insertEvents: mocks.insertEvents,
  stampMcpKey: (rows: unknown[]) => rows,
  stampViaAssistant: (rows: unknown[]) => rows,
}));
vi.mock("@/lib/server/attachments", () => ({
  copyResourcesToProject: vi.fn(async () => []),
  insertAttachments: vi.fn(async () => undefined),
  parseResourcesInput: vi.fn(() => []),
}));
vi.mock("@/lib/server/description-mentions", () => ({ notifyDescriptionMentions: vi.fn() }));
vi.mock("@/lib/server/description-collaboration", () => ({ syncDescriptionWrite: vi.fn() }));
vi.mock("@/lib/server/page-links", () => ({ queuePageLinks: vi.fn() }));
vi.mock("@/lib/server/text-edit", () => ({ editTextPassages: vi.fn() }));
vi.mock("@/lib/server/smart-fill-objective", async () => ({
  fallbackObjectiveName: (text: string | null) => text?.split("\n")[0].trim() || null,
  resolveObjectiveSmartFillPayer: mocks.resolvePayer,
  runObjectiveSmartFill: mocks.runFill,
}));
vi.mock("@/lib/server/smart-assign-objective", () => ({
  objectiveLeadEvent: (objectiveId: string, choice: { leadId: string; fromWork: boolean }) => ({
    objective_id: objectiveId,
    actor_id: null,
    type: "updated",
    field: "lead_user_id",
    to_value: choice.leadId,
    via_smart_assign: true,
    smart_assign_ai: choice.fromWork,
  }),
  suggestObjectiveLead: mocks.suggestLead,
}));
// The deferred refill runs at once, so the test sees its choice being asked for.
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (work: () => Promise<void>) => mocks.scheduleRefill(work),
}));

import { createObjective, updateObjective } from "./objectives";

const PROJECT = "11111111-1111-4111-8111-111111111111";

function access(smartAssign = true) {
  return {
    canWrite: true,
    project: { id: PROJECT, owner_id: "owner", name: "Minddy", smart_assign_enabled: smartAssign },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectAccess.mockResolvedValue(access());
  mocks.resolvePayer.mockResolvedValue({ userId: "author", name: true });
  mocks.runFill.mockResolvedValue({});
  mocks.suggestLead.mockResolvedValue(null);
  mocks.rpc.mockImplementation(async (_fn: string, args: { p_values: Record<string, unknown> }) => ({
    data: { id: "objective-1", project_id: PROJECT, ...args.p_values },
    error: null,
  }));
});

function insertedValues() {
  return mocks.rpc.mock.calls[0][1].p_values as Record<string, unknown>;
}
function writtenEvents() {
  return (mocks.insertEvents.mock.calls as unknown[][])[0][1] as Record<string, unknown>[];
}

describe("createObjective with Smart Fill", () => {
  it("fills only the empty fields and names them in the activity", async () => {
    mocks.runFill.mockResolvedValue({ color: "#22c55e", target_date: "2027-01-31" });
    const result = await createObjective({
      projectId: PROJECT,
      actorId: "author",
      input: { name: "Onboarding", description: "Ship by the end of January", color: "#ef4444" },
    });
    expect(result.ok).toBe(true);
    // The pass is only asked for what the author left empty.
    expect(mocks.runFill.mock.calls[0][0].empty).toEqual(["target_date"]);
    expect(insertedValues()).toMatchObject({ name: "Onboarding", color: "#ef4444", target_date: "2027-01-31" });
    expect(writtenEvents()).toContainEqual(
      expect.objectContaining({ field: "smart_fill", to_value: "target_date", via_smart_fill: true }),
    );
  });

  it("writes the name from the description when the author left it empty", async () => {
    mocks.runFill.mockResolvedValue({ name: "Onboarding redesign" });
    await createObjective({
      projectId: PROJECT,
      actorId: "author",
      input: { name: "", description: "Redo the onboarding\nShip in January" },
    });
    expect(insertedValues().name).toBe("Onboarding redesign");
  });

  it("falls back to the description's first line when the pass gives no name", async () => {
    await createObjective({
      projectId: PROJECT,
      actorId: "author",
      input: { name: "", description: "Redo the onboarding\nShip in January" },
    });
    expect(insertedValues().name).toBe("Redo the onboarding");
    expect(writtenEvents().some((e) => e.field === "smart_fill")).toBe(false);
  });

  it("refuses an empty name when Smart Fill may not write it", async () => {
    mocks.resolvePayer.mockResolvedValue(null);
    const result = await createObjective({
      projectId: PROJECT,
      actorId: "author",
      input: { name: "", description: "Redo the onboarding", smart_fill: false },
    });
    expect(result).toMatchObject({ ok: false, errorKey: "nameRequired" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("createObjective with Smart Assign", () => {
  it("gives an objective without a lead the suggested one, and says so", async () => {
    mocks.suggestLead.mockResolvedValue({ leadId: "ana", fromWork: true });
    await createObjective({ projectId: PROJECT, actorId: "author", input: { name: "Onboarding", lead_user_id: null } });
    expect(insertedValues().lead_user_id).toBe("ana");
    expect(writtenEvents()).toContainEqual(
      expect.objectContaining({ field: "lead_user_id", to_value: "ana", via_smart_assign: true, actor_id: null }),
    );
  });

  it("keeps a lead chosen by hand, and leaves done objectives alone", async () => {
    await createObjective({ projectId: PROJECT, actorId: "author", input: { name: "A", lead_user_id: "ben" } });
    await createObjective({ projectId: PROJECT, actorId: "author", input: { name: "B", status: "done" } });
    expect(mocks.suggestLead).not.toHaveBeenCalled();
  });
});

describe("updateObjective clearing the lead", () => {
  const stored = {
    id: "objective-1",
    project_id: PROJECT,
    name: "Onboarding",
    description: null,
    status: "planned",
    lead_user_id: "ana",
    updated_at: "2026-11-09T00:00:00Z",
  };

  beforeEach(() => {
    mocks.objectiveSelect.mockResolvedValue({ data: stored });
    mocks.rpc.mockResolvedValue({
      data: { previous: stored, objective: { ...stored, lead_user_id: null } },
      error: null,
    });
  });

  it("asks Smart Assign for a new lead on a Smart Assign project", async () => {
    const result = await updateObjective({ objectiveId: "objective-1", actorId: "author", input: { lead_user_id: null } });
    expect(result.ok).toBe(true);
    expect(mocks.scheduleRefill).toHaveBeenCalledTimes(1);
    await mocks.scheduleRefill.mock.calls[0][0]();
    expect(mocks.suggestLead).toHaveBeenCalledWith({ projectId: PROJECT, name: "Onboarding", description: null });
  });

  it("leaves the lead empty when Smart Assign is off", async () => {
    mocks.getProjectAccess.mockResolvedValue(access(false));
    await updateObjective({ objectiveId: "objective-1", actorId: "author", input: { lead_user_id: null } });
    expect(mocks.scheduleRefill).not.toHaveBeenCalled();
  });
});
