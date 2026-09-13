import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CyclePrefs } from "@/lib/cycle-prefs";
import { ensureCycles, todayInTz, type CycleRow } from "@/lib/server/cycles";
import {
  updateIssueFields,
  type UpdateIssueResult,
} from "@/lib/server/update-issue";

export type CycleTarget = "current" | "next";

export interface CycleMoveFailure {
  issue_id: string;
  code: string;
  error: string;
}

export interface MoveIssuesBetweenCyclesResult {
  source: CycleRow;
  target: CycleRow;
  moved_ids: string[];
  unchanged_ids: string[];
  assignment_changed_ids: string[];
  failed: CycleMoveFailure[];
}

type IssueUpdater = typeof updateIssueFields;

const MOVE_ERROR_MESSAGES: Record<string, string> = {
  issueNotFound: "Issue not found or no longer accessible.",
  closedIssueCannotJoinCycle: "Closed issues cannot move to another cycle.",
  triageCannotJoinCycle:
    "Issues in triage cannot join a cycle. Move them out of triage first.",
  cycleAssignmentChanged:
    "The issue is no longer assigned to the cycle owner. Refresh the cycle and try again.",
  cycleSourceChanged:
    "The issue is no longer in the expected source cycle. Refresh the cycle and try again.",
  invalidCycle:
    "The target cycle is no longer valid for this account. Refresh the cycle and try again.",
  databaseError: "The issue could not be moved because of a database error.",
};

function moveFailure(
  issueId: string,
  result: Extract<UpdateIssueResult, { ok: false }>,
) {
  const code =
    result.errorKey ?? (result.status === 409 ? "staleIssue" : "updateFailed");
  return {
    issue_id: issueId,
    code,
    error:
      result.rawMessage ??
      MOVE_ERROR_MESSAGES[code] ??
      "The issue could not be moved.",
  };
}

/**
 * Move selected issues between the user's resolved current and next windows.
 *
 * The opposite window is the required source. Each issue is guarded against
 * stale cycle and assignment state inside updateIssueFields, and the normal
 * cycle invariant keeps it assigned to this cycle owner without changing its
 * status. Repeating an already-completed move is an idempotent success.
 */
export async function moveIssuesBetweenResolvedCycles({
  userId,
  actorId,
  issueIds,
  source,
  target,
  viaAssistant = false,
  mcpKeyId = null,
  updateIssue = updateIssueFields,
}: {
  userId: string;
  actorId: string;
  issueIds: string[];
  source: CycleRow;
  target: CycleRow;
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
  updateIssue?: IssueUpdater;
}): Promise<MoveIssuesBetweenCyclesResult> {
  const movedIds: string[] = [];
  const unchangedIds: string[] = [];
  const assignmentChangedIds: string[] = [];
  const failed: CycleMoveFailure[] = [];

  if (source.user_id !== userId || target.user_id !== userId) {
    return {
      source,
      target,
      moved_ids: [],
      unchanged_ids: [],
      assignment_changed_ids: [],
      failed: [...new Set(issueIds)].map((issueId) => ({
        issue_id: issueId,
        code: "invalidCycle",
        error:
          "The source or target cycle no longer belongs to this account. Refresh the cycle and try again.",
      })),
    };
  }

  for (const issueId of new Set(issueIds)) {
    const result = await updateIssue({
      issueId,
      actorId,
      input: { cycle_id: target.id },
      viaAssistant,
      mcpKeyId,
      cycleMove: {
        sourceCycleId: source.id,
        targetCycleId: target.id,
        ownerId: userId,
      },
    });
    if (!result.ok) {
      failed.push(moveFailure(issueId, result));
      continue;
    }
    if (result.changed) movedIds.push(issueId);
    else unchangedIds.push(issueId);
    if (result.assignmentChanged) assignmentChangedIds.push(issueId);
  }

  return {
    source,
    target,
    moved_ids: movedIds,
    unchanged_ids: unchangedIds,
    assignment_changed_ids: assignmentChangedIds,
    failed,
  };
}

/** Shared current/next resolver for interactive Numo calls and routines. */
export async function moveIssuesBetweenCycles({
  service,
  userId,
  actorId,
  prefs,
  timezone,
  issueIds,
  targetCycle,
  viaAssistant = false,
  mcpKeyId = null,
}: {
  service: SupabaseClient;
  userId: string;
  actorId: string;
  prefs: CyclePrefs;
  timezone?: string | null;
  issueIds: string[];
  targetCycle: CycleTarget;
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
}): Promise<
  | { ok: true; result: MoveIssuesBetweenCyclesResult }
  | { ok: false; error: string }
> {
  const ensured = await ensureCycles({
    service,
    userId,
    prefs,
    today: todayInTz(timezone),
  });
  const current = ensured.current;
  const next = ensured.upcoming[0] ?? null;
  if (!current) return { ok: false, error: "No current cycle exists yet." };
  if (!next) return { ok: false, error: "No next cycle exists yet." };

  const source = targetCycle === "next" ? current : next;
  const target = targetCycle === "next" ? next : current;
  return {
    ok: true,
    result: await moveIssuesBetweenResolvedCycles({
      userId,
      actorId,
      issueIds,
      source,
      target,
      viaAssistant,
      mcpKeyId,
    }),
  };
}
