import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureCycles = vi.fn();
const todayInTz = vi.fn(() => "2026-09-13");
const updateIssueFields = vi.fn();

vi.mock("@/lib/server/cycles", () => ({
  ensureCycles,
  todayInTz,
}));
vi.mock("@/lib/server/update-issue", () => ({
  updateIssueFields,
}));

const { moveIssuesBetweenCycles } = await import("./cycle-issues");

const current = {
  id: "cycle-current",
  user_id: "user-1",
  start_date: "2026-09-07",
  end_date: "2026-09-14",
  intensity: "medium" as const,
  target_points: 20,
  completed_points: null,
  filled_at: null,
};
const next = {
  ...current,
  id: "cycle-next",
  start_date: "2026-09-14",
  end_date: "2026-09-21",
};

beforeEach(() => {
  vi.clearAllMocks();
  ensureCycles.mockResolvedValue({ current, upcoming: [next], past: [] });
  updateIssueFields.mockResolvedValue({
    ok: true,
    issue: { category_ids: [], assignee_id: "user-1" },
    changed: true,
    assignmentChanged: false,
  });
});

describe("moveIssuesBetweenCycles", () => {
  it("resolves the next window using the caller's timezone", async () => {
    const prefs = {
      enabled: true,
      durationWeeks: 1 as const,
      startDow: 1,
      intensity: "medium" as const,
      upcomingCount: 2,
      autoCaptureStarted: true,
      autoCaptureCompleted: true,
    };

    const result = await moveIssuesBetweenCycles({
      service: {} as never,
      userId: "user-1",
      actorId: "user-1",
      prefs,
      timezone: "Europe/Paris",
      issueIds: ["issue-1"],
      targetCycle: "next",
      viaAssistant: true,
    });

    expect(todayInTz).toHaveBeenCalledWith("Europe/Paris");
    expect(ensureCycles).toHaveBeenCalledWith({
      service: {},
      userId: "user-1",
      prefs,
      today: "2026-09-13",
    });
    expect(result).toMatchObject({
      ok: true,
      result: {
        source: { id: "cycle-current" },
        target: { id: "cycle-next" },
        moved_ids: ["issue-1"],
      },
    });
  });

  it("can move next-cycle issues back to the current window", async () => {
    const result = await moveIssuesBetweenCycles({
      service: {} as never,
      userId: "user-1",
      actorId: "user-1",
      prefs: {} as never,
      timezone: "UTC",
      issueIds: ["issue-1"],
      targetCycle: "current",
    });

    expect(result).toMatchObject({
      ok: true,
      result: {
        source: { id: "cycle-next" },
        target: { id: "cycle-current" },
      },
    });
    expect(updateIssueFields).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { cycle_id: "cycle-current" },
        cycleMove: expect.objectContaining({
          sourceCycleId: "cycle-next",
          targetCycleId: "cycle-current",
        }),
      }),
    );
  });
});
