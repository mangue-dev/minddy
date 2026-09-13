import { describe, expect, it } from "vitest";

import { validateCycleMoveSnapshot } from "./cycle-move";

const move = {
  sourceCycleId: "cycle-current",
  targetCycleId: "cycle-next",
  ownerId: "user-1",
};

describe("cycle move preconditions", () => {
  it("allows an open issue that is still in the source cycle", () => {
    expect(
      validateCycleMoveSnapshot(
        {
          status: "in_progress",
          assignee_id: "user-1",
          cycle_id: "cycle-current",
        },
        move,
      ),
    ).toBe("move");
  });

  it("treats a repeated completed move as unchanged", () => {
    expect(
      validateCycleMoveSnapshot(
        {
          status: "todo",
          assignee_id: "user-1",
          cycle_id: "cycle-next",
        },
        move,
      ),
    ).toBe("unchanged");
  });

  it.each(["done", "canceled", "duplicate"] as const)(
    "rejects the closed %s status",
    (status) => {
      expect(
        validateCycleMoveSnapshot(
          {
            status,
            assignee_id: "user-1",
            cycle_id: "cycle-current",
          },
          move,
        ),
      ).toBe("closedIssueCannotJoinCycle");
    },
  );

  it("reports triage separately from closed issues", () => {
    expect(
      validateCycleMoveSnapshot(
        {
          status: "triage",
          assignee_id: "user-1",
          cycle_id: "cycle-current",
        },
        move,
      ),
    ).toBe("triageCannotJoinCycle");
  });

  it("detects assignment changes before moving", () => {
    expect(
      validateCycleMoveSnapshot(
        {
          status: "todo",
          assignee_id: "user-2",
          cycle_id: "cycle-current",
        },
        move,
      ),
    ).toBe("cycleAssignmentChanged");
  });

  it("detects stale source-cycle state", () => {
    expect(
      validateCycleMoveSnapshot(
        {
          status: "todo",
          assignee_id: "user-1",
          cycle_id: null,
        },
        move,
      ),
    ).toBe("cycleSourceChanged");
  });
});
