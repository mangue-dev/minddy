import { describe, expect, it, vi } from "vitest";

import { moveIssuesBetweenResolvedCycles } from "./cycle-issues";
import type { CycleRow } from "./cycles";

const cycle = (id: string, userId = "user-1"): CycleRow => ({
  id,
  user_id: userId,
  start_date: id === "cycle-current" ? "2026-09-07" : "2026-09-14",
  end_date: id === "cycle-current" ? "2026-09-14" : "2026-09-21",
  intensity: "medium",
  target_points: 20,
  completed_points: null,
  filled_at: null,
});

describe("moveIssuesBetweenResolvedCycles", () => {
  it("moves a partial batch without passing a status update", async () => {
    const updateIssue = vi.fn(
      async ({ issueId }: { issueId: string } & Record<string, unknown>) => {
        if (issueId === "closed") {
          return {
            ok: false as const,
            status: 400,
            errorKey: "closedIssueCannotJoinCycle" as const,
          };
        }
        if (issueId === "stale") {
          return {
            ok: false as const,
            status: 409,
            errorKey: "cycleSourceChanged" as const,
          };
        }
        return {
          ok: true as const,
          issue: { category_ids: [], assignee_id: "user-1" },
          changed: issueId !== "already-moved",
          assignmentChanged: false,
        };
      },
    );

    const result = await moveIssuesBetweenResolvedCycles({
      userId: "user-1",
      actorId: "user-1",
      issueIds: ["open", "already-moved", "closed", "stale"],
      source: cycle("cycle-current"),
      target: cycle("cycle-next"),
      viaAssistant: true,
      updateIssue: updateIssue as never,
    });

    expect(result.moved_ids).toEqual(["open"]);
    expect(result.unchanged_ids).toEqual(["already-moved"]);
    expect(result.failed).toEqual([
      {
        issue_id: "closed",
        code: "closedIssueCannotJoinCycle",
        error: "Closed issues cannot move to another cycle.",
      },
      {
        issue_id: "stale",
        code: "cycleSourceChanged",
        error:
          "The issue is no longer in the expected source cycle. Refresh the cycle and try again.",
      },
    ]);
    for (const [input] of updateIssue.mock.calls) {
      expect(input.input).toEqual({ cycle_id: "cycle-next" });
      expect(input.input).not.toHaveProperty("status");
      expect(input.cycleMove).toEqual({
        sourceCycleId: "cycle-current",
        targetCycleId: "cycle-next",
        ownerId: "user-1",
      });
    }
  });

  it("rejects cycle ownership changes before updating any issue", async () => {
    const updateIssue = vi.fn();

    const result = await moveIssuesBetweenResolvedCycles({
      userId: "user-1",
      actorId: "user-1",
      issueIds: ["issue-1", "issue-2"],
      source: cycle("cycle-current", "user-2"),
      target: cycle("cycle-next"),
      updateIssue: updateIssue as never,
    });

    expect(updateIssue).not.toHaveBeenCalled();
    expect(result.failed).toHaveLength(2);
    expect(result.failed.every((item) => item.code === "invalidCycle")).toBe(
      true,
    );
  });

  it("deduplicates issue ids so a routine retry cannot move one issue twice", async () => {
    const updateIssue = vi.fn(async () => ({
      ok: true as const,
      issue: { category_ids: [], assignee_id: "user-1" },
      changed: true,
      assignmentChanged: false,
    }));

    const result = await moveIssuesBetweenResolvedCycles({
      userId: "user-1",
      actorId: "user-1",
      issueIds: ["issue-1", "issue-1"],
      source: cycle("cycle-current"),
      target: cycle("cycle-next"),
      updateIssue: updateIssue as never,
    });

    expect(updateIssue).toHaveBeenCalledTimes(1);
    expect(result.moved_ids).toEqual(["issue-1"]);
  });
});
