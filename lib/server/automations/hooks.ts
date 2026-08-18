import "server-only";

import type { AgentRun } from "@/lib/server/agent/runs";
import type { AutomationEvent, AutomationSource } from "@/lib/automations";
import type { IssueStatus } from "@/lib/issue-constants";
import { afterOrNow } from "@/lib/server/after-safe";

/**
 * Automation HOOKS (MIN-147) — the only two places where the loop learns that
 * something happened: a status change and the end of a run.
 *
 * This module exists for a specific reason: `update-issue.ts` and `runs.ts` need
 * to call the engine, and the engine calls both of them back (a `set_status`
 * action returns to `updateIssueFields`; a step launches a run). A static cross-
 * import would create a cycle during module INITIALIZATION. The engine is therefore
 * loaded ON CALL (`await import`), and both callers need to know only this file,
 * which imports nothing heavy.
 *
 * Everything is best-effort: a failed automation must never fail the write or run
 * that triggered it.
 */

interface ScheduleParams {
  issueId: string;
  projectId: string;
  event: AutomationEvent;
  chainId?: string | null;
}

async function schedule(params: ScheduleParams): Promise<void> {
  const { scheduleAutomations } = await import("./engine");
  scheduleAutomations(params);
}

/**
 * Retains the invocation BEFORE the first `await`.
 *
 * This was the common fault of the three hooks: they called `void go()`, and
 * `go` entered `after()` only after two round trips through the base layer. In
 * between, nothing retained the function — a floating promise is not registered
 * with `waitUntil`, and the platform contract does not guarantee it. What was lost
 * was not cosmetic: a chain could fail to advance or to stop when a human asked.
 * Since nothing recovers a chain in the `running` state, each loss left a locked
 * ticket rather than a replayable failure.
 */
function inBackground(work: () => Promise<void>, label: string): void {
  afterOrNow(() =>
    work().catch((e) => console.error(`[automations] ${label} failed:`, (e as Error).message)),
  );
}

/**
 * A ticket has REALLY changed status. Called from `updateIssueFields` outside the
 * critical path, with a silent no-op if the world has moved — the same contract as
 * its neighbors `scheduleSmartAssign` and `scheduleFeedbackStatusSync`.
 *
 * Be careful of the loop: the `set_status` action of a rule goes back through
 * `updateIssueFields` and therefore retriggers this hook. These are `played_rule_ids`
 * and `MAX_CHAIN_STEPS` that stop it, not this call point.
 */
export function scheduleStatusAutomations(params: {
  issueId: string;
  projectId: string;
  from: IssueStatus | null;
  to: IssueStatus;
  /**
   * WHO made the change. Without it, a rule cannot distinguish “I move a card”
   * from “my MCP agent files its ticket” — and code-writing presets should start
   * only in the first case.
   */
  source: AutomationSource;
}): void {
  void schedule({
    issueId: params.issueId,
    projectId: params.projectId,
    event: {
      type: "status_changed",
      from: params.from,
      to: params.to,
      source: params.source,
    },
  }).catch((e) => console.error("[automations] status hook failed:", (e as Error).message));
}

/**
 * SOMEONE TOOK OVER the ticket — cancel its PENDING chain.
 *
 * The hand-off is usually inferred from the status: if the ticket moved, the chain
 * is no longer needed. But half of the manual actions move NOTHING:
 *
 * • launch “generate a plan”, “check the plan”, “check implementation”, or a free
 *   instruction — only `implement` starts the ticket (`intentStartsWork`); the
 *   other three leave it where it is;
 * • copy the plan, verification, or free-instruction prompt — only the implementation
 *   prompt advances the ticket (`shouldAutoStartOnPromptCopy`): planning is not
 *   starting the work.
 *
 * In all these cases, the ticket remains “to do” and the pending chain would run
 * to completion: Numo would restart work we had just taken over. This hook states
 * that explicitly for all five ways to launch work and all four ways to copy a prompt.
 *
 * SILENT CANCELLATION: the chain has done no work and spent nothing. Best-effort,
 * and strictly limited to pending chains — a RUNNING chain is unaffected; the
 * `alreadyRunning` refusal governs that case.
 */
export function handOffToHuman(issueId: string): void {
  inBackground(async () => {
    const { chainForIssue, cancelPendingChain } = await import("./chain");
    const chain = await chainForIssue(issueId);
    if (chain?.status === "pending") await cancelPendingChain(chain.id, "taken_over");
  }, "hand-off hook");
}

/** Run statuses that the chain treats as successful. */
const OK_STATUSES = new Set(["completed"]);

/**
 * A CHAIN RUN JUST FINISHED. Called from `stampRun` — the REQUIRED path to a
 * terminal status. Its `.in("status", guard)` condition ensures that only one
 * update wins, so the chain advances only once even if two chunks try to finish.
 * All eight exit paths in `execute.ts` converge here; the steering re-queue
 * (`queued`, non-terminal) is excluded automatically.
 *
 * The run's cost is CUMULATED on the chain before the rules are evaluated again:
 * that is what makes the chain cap enforceable at the next step.
 */
export function notifyChainOfRunEnd(run: AgentRun): void {
  if (!run.chain_id || !run.issue_id) return;
  inBackground(async () => {
    const { recomputeChainSpend } = await import("./chain");
    // Recalculation, not accumulation: a run can cross several pauses, and `cost_usd`
    // is cumulative — adding the total on every pass would count it multiple times.
    await recomputeChainSpend(run.chain_id as string);
    // The agent asked a QUESTION (`ask_user`) and is waiting for the answer. Its TURN
    // ended successfully — hence the `completed` status that brings us here — but
    // its WORK did not. Continuing now would start the next step over an unanswered
    // question, and the question would leave with the run. Accumulate the cost and
    // stop here: the answer re-queues the run (`queued`, non-terminal), and its NEXT
    // completion — the one that no longer waits for input — advances the chain.
    if (run.awaiting_input) return;
    await schedule({
      issueId: run.issue_id as string,
      projectId: run.project_id,
      chainId: run.chain_id,
      event: {
        type: "run_finished",
        intent: run.intent ?? "implement",
        outcome: OK_STATUSES.has(run.status) ? "ok" : "failed",
      },
    });
  }, "run-end hook");
}

/**
 * A HUMAN “stop” on a chain run STOPS the chain — it does not advance it.
 * The interrupt button means that someone wants the work to stop; it is not a
 * completed step. This is where that distinction must be recorded: the run-end hook
 * cannot infer it because `clearInterrupt` has already cleared the flag when
 * `stampRun` executes.
 */
export function stopChainOnInterrupt(chainId: string): void {
  inBackground(async () => {
    const { getChain } = await import("./chain");
    const { haltChain } = await import("./report");
    const chain = await getChain(chainId);
    if (chain) await haltChain(chain, "interrupted");
  }, "interrupt hook");
}
