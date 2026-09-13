import { isClosedStatus, type IssueStatus } from "./issue-constants";

export interface CycleMovePrecondition {
  sourceCycleId: string;
  targetCycleId: string;
  ownerId: string;
}

export type CycleMoveValidation =
  | "move"
  | "unchanged"
  | "closedIssueCannotJoinCycle"
  | "triageCannotJoinCycle"
  | "cycleAssignmentChanged"
  | "cycleSourceChanged";

/** Validate one issue snapshot immediately before an explicit cycle move. */
export function validateCycleMoveSnapshot(
  issue: {
    status: IssueStatus;
    assignee_id: string | null;
    cycle_id: string | null;
  },
  move: CycleMovePrecondition,
): CycleMoveValidation {
  if (isClosedStatus(issue.status)) return "closedIssueCannotJoinCycle";
  if (issue.status === "triage") return "triageCannotJoinCycle";
  if (issue.assignee_id !== move.ownerId) return "cycleAssignmentChanged";
  if (issue.cycle_id === move.targetCycleId) return "unchanged";
  if (issue.cycle_id !== move.sourceCycleId) return "cycleSourceChanged";
  return "move";
}
