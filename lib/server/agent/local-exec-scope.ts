/**
 * Local execution admission shared by launch, persistence, and lease issuance.
 * Only an authenticated person reviewing the exact context may select a developer
 * machine; unattended or third-party-controlled contexts fail closed.
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

export type LocalRunScopeRefusal =
  | "pull_request"
  | "routine"
  | "chain"
  | "trigger"
  | "issue_confirmation";

export type LocalRunScope =
  { ok: true } | { ok: false; reason: LocalRunScopeRefusal };

/**
 * Admit a closed list of user-controlled sources. A future trigger is denied
 * until this predicate is deliberately extended. Issue text needs an explicit
 * per-run acknowledgement because it may contain third-party content.
 */
export function localRunScope(ctx: LocalRunContext): LocalRunScope {
  if (ctx.pullRequestId) return { ok: false, reason: "pull_request" };
  if (ctx.routineId) return { ok: false, reason: "routine" };
  if (ctx.chainId) return { ok: false, reason: "chain" };
  if (ctx.triggeredBy !== "button" && ctx.triggeredBy !== "chat") {
    return { ok: false, reason: "trigger" };
  }
  if (ctx.issueId && ctx.localIssueContextConfirmed !== true) {
    return { ok: false, reason: "issue_confirmation" };
  }
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
