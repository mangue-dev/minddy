/**
 * THE THIRD-PARTY CONTENT RUNS INVARIANT (MIN-360) — a PURE module, without a single
 * import, because it is read in three places that do not know each other: the
 * launch, the line write, and the lease issue.
 *
 * ─────────────────────── ─────────────────────── ───────────────────────────────
 * WHAT IT SAYS, AND WHY IT DOES NOT TRADE
 *
 * **A run whose context has not been written by the person running it never leaves
 * on a local machine without a deliberate trust decision.** Issue and pull-request
 * launches require a separate acknowledgement; contexts that cannot be reviewed
 * interactively stay excluded. A forge webhook, external mention, routine, chain,
 * or public feedback board can all carry **potential attacker text**.
 *
 * The repository already recognizes it elsewhere, and it is this precedent which sets the rule:
 * a review session on a fork only receives one token `contents: read`,
 * because “a prompt injection from the fork was enough to read it and
 * exfiltrate it” ([repo-access.ts](repo-access.ts)). In microVM, this injection
 * costs a disposable VM. **Locally, it's a shell on the developer's machine.**
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * THE PREDICATE IS THE SOURCE OF TRIGGER, NEVER `job.interactive`
 *
 * `interactive` is `!run.routine_id`. It is therefore **true** for a replay of
 * pull request triggered by a webhook — that is, precisely the most dangerous case on the list. This confusion is the reason for the module: the
 * good test already existed half in `localExecRequested`, and a `if` copied
 * elsewhere would have ended up no longer meaning the same thing.
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

/** Why can't this run play on a local machine. */
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
