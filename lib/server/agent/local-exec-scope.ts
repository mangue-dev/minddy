/**
 * THE THIRD-PARTY CONTENT RUNS INVARIANT (MIN-360) — a PURE module, without a single
 * import, because it is read in three places that do not know each other: the
 * launch, the line write, and the lease issue.
 *
 * ─────────────────────── ─────────────────────── ───────────────────────────────
 * WHAT IT SAYS, AND WHY IT DOES NOT TRADE
 *
 * **A run whose context has not been written by the person running it never leaves
 * on a local machine.** The `pr` anchor, a forge webhook, a
 * mention external, a routine, a string, the public feedback board: in
 * all these cases, the text that the model reads is **potential attacker text**.
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
export type LocalRunTrigger = "button" | "chat" | "mention" | "automation" | "routine";

/** What you need to know about a run to tell if it can play on a machine. */
export interface LocalRunContext {
  triggeredBy: LocalRunTrigger | string;
  routineId?: string | null;
  chainId?: string | null;
  /** The `pr` anchor — a replay reads a diff and fork comments. */
  pullRequestId?: string | null;
}

/** Why can't this run play on a local machine. */
export type LocalRunScopeRefusal = "pull_request" | "routine" | "chain" | "trigger";

export type LocalRunScope = { ok: true } | { ok: false; reason: LocalRunScopeRefusal };

/**
 * CAN THIS RUN, BY ITS NATURE, PLAY ON A LOCAL MACHINE?
 *
 * A CLOSED list of authorized sources, never a list of prohibited sources:
 * the entry point that we will add next year must be refused by default, not
 * authorized by oversight.
 *
 * `mention` is excluded voluntarily, and this is not an excess of caution: a
 * mention may come from a forge comment copied by a webhook, and nothing in
 * this place does not distinguish the two.
 */
export function localRunScope(ctx: LocalRunContext): LocalRunScope {
  if (ctx.pullRequestId) return { ok: false, reason: "pull_request" };
  if (ctx.routineId) return { ok: false, reason: "routine" };
  if (ctx.chainId) return { ok: false, reason: "chain" };
  if (ctx.triggeredBy !== "button" && ctx.triggeredBy !== "chat") {
    return { ok: false, reason: "trigger" };
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
}): LocalRunScope {
  return localRunScope({
    triggeredBy: row.triggered_by ?? "",
    routineId: row.routine_id,
    chainId: row.chain_id,
    pullRequestId: row.pull_request_id,
  });
}
