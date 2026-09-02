/**
 * THE LOCAL DESTINATION INVARIANT (MIN-492) — a pure module shared by launch,
 * persistence, and lease issuance.
 *
 * The signed-in user chooses local execution when creating the run. That choice
 * is frozen on the run; a later mention, routine tick, PR update, or continuation
 * may add context but cannot select a developer machine by itself. Authentication,
 * project membership, the device-bound lease, process isolation, and explicit
 * resource ceilings remain the enforcement boundaries. Trigger and anchor labels
 * are not capability profiles and therefore do not revoke the chosen destination.
 */

/** Where the trigger came from, as `agent_runs.triggered_by` records it. */
export type LocalRunTrigger =
  "button" | "chat" | "mention" | "automation" | "routine";

/** What you need to know about a run to tell if it can play on a machine. */
export interface LocalRunContext {
  triggeredBy: LocalRunTrigger | string;
  routineId?: string | null;
  chainId?: string | null;
  /** The `pr` anchor — a replay reads a diff and fork comments. */
  pullRequestId?: string | null;
  /** An issue can contain text supplied by an external or anonymous author. */
  issueId?: string | null;
  /** Explicit acknowledgement made by the signed-in local user for this launch. */
  localIssueContextConfirmed?: boolean | null;
}

/** Legacy refusal vocabulary retained for persisted/API compatibility. */
export type LocalRunScopeRefusal =
  "routine" | "chain" | "trigger" | "issue_confirmation";

export type LocalRunScope =
  { ok: true } | { ok: false; reason: LocalRunScopeRefusal };

/**
 * Every authenticated run source may use the local OpenCode harness. The
 * trigger, anchor and destination are context, not capability gates; process
 * isolation and project access remain enforcement boundaries outside this
 * predicate.
 */
export function localRunScope(_ctx: LocalRunContext): LocalRunScope {
  return { ok: true };
}

/** The same question asked of a LINE `agent_runs` — for surfaces that read
 * the base rather than the entry of a launch (issuance of the lease). */
export function rowMayRunLocally(row: {
  triggered_by?: string | null;
  routine_id?: string | null;
  chain_id?: string | null;
  pull_request_id?: string | null;
  issue_id?: string | null;
  local_issue_context_confirmed?: boolean | null;
}): LocalRunScope {
  return localRunScope({
    triggeredBy: row.triggered_by ?? "",
    routineId: row.routine_id,
    chainId: row.chain_id,
    pullRequestId: row.pull_request_id,
    issueId: row.issue_id,
    localIssueContextConfirmed: row.local_issue_context_confirmed,
  });
}
