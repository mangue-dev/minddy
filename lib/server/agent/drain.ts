import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordSandboxUsage } from "@/lib/server/usage";
import { spentFromLedger, type AiUsageBillTo } from "@/lib/server/ai-usage";

import { appendEvent, claimRun, notifyAgentRun, stampRun } from "./runs";
import { SANDBOX_USAGE_SEQ_BASE } from "./pr-landing";
import { executeAgentRun } from "./execute";
import { isLoopCommandAlive, stopSandboxByName } from "./sandbox";
import { revokeRunKey } from "./run-key";
import { currentDeploymentScope } from "./deployment";

/**
 * Drain runs from the agent (MIN-46) — the worker. Self-budgeted within 300s of
 * the function: reclaim the blocked runs, then claim→execute loop as long as there
 * remains of the budget and runs due. A suspended run re-`queue` with
 * not_before=now → the next re-request resumes it IN PROCESS (continuation
 * low latency), like AutoKap.
 */

/**
 * Budget of a drain launched from a 300 s route (`launchAgentRun` via `after`).
 * The CRON, for its part, runs in a function of 800 s and passes its own budget: the
 * budget cannot be a global constant, otherwise a drain triggered by a
 * launch user would think he had thirteen minutes and would be killed in
 * full chunk — checkpoint not written, turn lost.
 */
const DRAIN_TIME_BUDGET_MS = 270_000;
/**
 * WHAT A LAUNCH COSTS, and no longer what a chunk cost (MIN-225).
 *
 * `executeAgentRun` no longer executes the trick: it wakes up or clones the microVM,
 * writes the job and the bundle, launches the detached supervisor and RETURNS HAND. The
 * admission threshold therefore no longer has to cover thirteen minutes of work — only
 * a boot, whose clone is the heaviest post (~22 s measured, MIN-222)
 * and whose own timeout is 180 s.
 *
 * Two minutes: wide for a lukewarm boot, honest on a cold clone. En
 * below, we prefer to leave the run at `queued` — the next tick will resume it
 * with an entire window rather than being killed in the middle of `writeFiles`,
 * which would leave a microVM standing and a run `running` without process.
 */
const MIN_LAUNCH_BUDGET_MS = 120_000;
/** Inactivity beyond which the microVM is cut off from an idle run. */
const SANDBOX_IDLE_REAP_MS = 5 * 60_000;
/**
 * Idle runs whose microVM can be stopped. Completed sessions and failed turns
 * with a checkpoint both retain their sandbox briefly for a warm resumption.
 */
const RESTING_STATUSES = ["completed", "failed"];

/**
 * Inactivity reaper: cuts the microVM from runs AT IDLE (suspended or round finished)
 * that have remained inactive (> ~5 min) while keeping their snapshot persistent → the run remains
 * resumable (quick wake-up at the next message, without complete re-clone). Do not touch
 * neither the status, nor the checkpoint, nor sandbox_id: just mark sandbox_stopped_at
 * so as not to re-cut in a loop. Called at the head of each drain (~2 min via cron).
 *
 * IT ALSO REVOKES THE RUN KEY (MIN-223). It is here, and not at the end of the run,
 * because an idle session is not finished: it can start again on a
 * `steer`, and it is this restart which will restart. As long as the VM is running, its key
 * must live; once it's cut off, no one has a legitimate reason to use it — and the only thing that could still do that would be something we didn't want.
 */
export async function reapIdleSandboxes(
  service: SupabaseClient,
): Promise<{ reaped: number }> {
  const cutoff = new Date(Date.now() - SANDBOX_IDLE_REAP_MS).toISOString();
  const { data } = await service
    .from("agent_runs")
    .select("id, sandbox_id, provider_key_id")
    .in("status", RESTING_STATUSES)
    .not("sandbox_id", "is", null)
    .is("sandbox_stopped_at", null)
    .lt("last_activity_at", cutoff)
    .order("last_activity_at", { ascending: true }) // the most inactive first
    .limit(50);
  const rows = (data ?? []) as Array<{
    id: string;
    sandbox_id: string | null;
    provider_key_id: string | null;
  }>;
  let reaped = 0;
  for (const row of rows) {
    if (!row.sandbox_id) continue;
    // CASE BEFORE stopping: we reserve the cut (sandbox_stopped_at) under guard. If
    // the run has been resumed (steer) or re-activated (heartbeat) from SELECT, keeps it
    // do not match → we DO NOT stop a microVM in use.
    const reapClaim = randomUUID();
    const { data: claimed } = await service
      .from("agent_runs")
      .update({
        sandbox_stopped_at: new Date().toISOString(),
        sandbox_reap_claim: reapClaim,
        sandbox_reap_claimed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .in("status", RESTING_STATUSES)
      .is("sandbox_stopped_at", null)
      .lt("last_activity_at", cutoff)
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // resumption/competing activity → we leave the VM alone
    try {
      await stopSandboxByName(row.sandbox_id);
    // VM first, key second: in that order, a revocation that fails
    // leaves a capped key without a machine to use it. The reverse order
    // would open a window where the VM is still running with a dead key, and that's it
    // during recovery would die on 401s.
      if (row.provider_key_id) {
        await revokeRunKey(row.provider_key_id);
        await service
          .from("agent_runs")
          .update({ provider_key_id: null })
          .eq("id", row.id)
          .eq("provider_key_id", row.provider_key_id);
      }
    } finally {
      // A resume requires this persisted lease to be absent. Release it only
      // after the old sandbox stop has completed, and only if we still own it.
      await service
        .from("agent_runs")
        .update({ sandbox_reap_claim: null, sandbox_reap_claimed_at: null })
        .eq("id", row.id)
        .eq("sandbox_reap_claim", reapClaim);
    }
    reaped++;
  }
  return { reaped };
}

/**
 * Silence tolerated before going to ASK the platform if a tower still lives.
 *
 * This is not a death threshold — it is a QUESTION threshold. A round that
 * has just started is not worth a call to the Sandbox API each time the
 * cron passes; After a few minutes without an event, the question becomes legitimate. The
 * answer is a fact: `Command.exitCode` not zero ⇒ the process returned.
 */
const VM_LOOP_PROBE_AFTER_MS = 3 * 60_000;

/**
 * Recovery threshold when neither the supervisor heartbeat nor the Sandbox
 * probe can establish liveness. A healthy cloud turn may run for many hours:
 * its lightweight heartbeat refreshes every two minutes, and a successful
 * Sandbox probe always wins regardless of age. Fifteen minutes therefore means
 * at least seven missed heartbeats plus repeated inconclusive platform probes.
 */
const VM_LOOP_LOST_AFTER_MS = 15 * 60_000;

/**
 * Local execution cannot be probed while its host sleeps or disconnects. Keep
 * the wider recovery window there; cloud runs have an independent platform
 * probe and a two-minute supervisor heartbeat.
 */
const LOCAL_LOOP_LOST_AFTER_MS = 2 * 60 * 60_000;

/**
 * Delay beyond which a run `running` WITHOUT a command identifier is deemed
 * to have never started its loop.
 *
 * `startVmLoop` writes this identifier at the end of boot (~22 s cold): a
 * line which still does not have it after a quarter of an hour is a dead function
 * between the claim and the launch. There is nothing to probe - no command, therefore
 * no observation possible - and this is precisely the case that the old editorial team
 * let slip without saying it (`.not("loop_command_id", "is", null)` in the
 * query: these runs were not even looked at).
 *
 * Counted on `started_at` (placed on the claim, therefore specific to THIS turn) and not on the
 * silence: a re-queued run with a deadline ahead of it arrives at the claim with an already old activity clock, and counting it there would kill it in the middle of priming.
 */
const VM_LOOP_UNLAUNCHED_AFTER_MS = 15 * 60_000;

/**
 * THE WATCHDOG of runs whose loop lives in the microVM (MIN-224).
 *
 * IT REPLACED the sweeper by presumption (removed in MIN-225), and it was
 * not the same gesture. The old one declared dead any run `running` silent for
 * twenty minutes, then stole its claim — an acceptable heuristic when a chunk lasted
 * five minutes, untenable when a round can work for hours without writing an
 * event (a `npm test` that lasts, a model that thinks). This does not presume
 * anything: it ASKS the platform if the order still lives, and the platform
 * knows it.
 *
 * Three answers, three actions:
 *
 * - the process LIVES → we don't touch nothing, whatever the silence ;
 * - we don't KNOW (microVM not found, session expired, API down) → we don't
 * touch anything either. A watchdog that concludes with a silence of the API
 * would restore towers to full health. But the wait is BORNE
 * (`VM_LOOP_LOST_AFTER_MS`, and `VM_LOOP_UNLAUNCHED_AFTER_MS` for a line which
 * does not even have a command to query): "we don't know" cannot last
 * always, otherwise a run remains `running` until a human deletes the
 * in base;
 * - the process is DEAD → the session returns to idle on its LAST CHECKPOINT
 * (that of the periodic backup), **the thread says so**, and the compute of the
 * microVM is billed (cf. `recordSandboxUsage` below). This is what
 * distinguishes “the agent has stopped and this is why” from “the agent has not responded
 * for twenty minutes”.
 */
export async function reapDeadVmRuns(
  service: SupabaseClient,
): Promise<{ reaped: number }> {
  const cutoff = new Date(Date.now() - VM_LOOP_PROBE_AFTER_MS).toISOString();
  const { data } = await service
    .from("agent_runs")
    .select(
      "id, sandbox_id, loop_command_id, local_exec, created_by, project_id, issue_id, conversation_id, provider_key_id, run_id, routine_id, continuations, started_at, last_activity_at, cost_usd",
    )
    .eq("status", "running")
    .lt("last_activity_at", cutoff)
    .limit(50);
  const rows = (data ?? []) as Array<{
    id: string;
    sandbox_id: string | null;
    loop_command_id: string | null;
    local_exec: boolean | null;
    created_by: string | null;
    project_id: string;
    issue_id: string | null;
    conversation_id: string;
    provider_key_id: string | null;
    run_id: string | null;
    routine_id: string | null;
    continuations: number;
    started_at: string | null;
    last_activity_at: string | null;
    cost_usd: number;
  }>;

  /**
   * PROBES IN PARALLEL, pipes in series.
   *
   * Observe that a VIT process costs the entire delay of `isLoopCommandAlive`
   * (5 s: it is the absence of response which makes the response). In series, a queue of twenty healthy runs would eat up a minute and a half of the drain's budget before it claimed anything. The probes do not touch each other — placing them abreast reduces the cost to that of ONE.
   */
  const verdicts = await Promise.all(
    rows.map(async (row) => ({
      row,
      alive:
        row.sandbox_id && row.loop_command_id
          ? await isLoopCommandAlive(row.sandbox_id, row.loop_command_id)
          : null,
    })),
  );

  /**
   * How long has this tower not given any sign of life, and since
   * how long has it been claimed? `null` (date absent) = we do not know, and
   * we then limit nothing: the two temporal folds below only serve to
   * close a case that we have OBSERVED to be open, never to conclude on ignorance.
   */
  const agedMs = (at: string | null): number | null => {
    const ms = at ? Date.parse(at) : NaN;
    return Number.isFinite(ms) ? Date.now() - ms : null;
  };

  let reaped = 0;
  for (const { row, alive } of verdicts) {
    if (alive === true) continue; // the process lives: we don’t touch anything.
    if (alive === null) {
      /**
       * A cloud run has two independent signals: the supervisor heartbeat and
       * the Sandbox command probe. Repeated loss of both reaches the shorter
       * cloud recovery threshold. Local execution has no platform probe, so it
       * keeps the wider window needed for a sleeping or disconnected machine.
       * A cloud row without a command identifier uses the boot threshold because
       * no loop was ever launched.
       */
      const loopLostAfterMs = row.local_exec
        ? LOCAL_LOOP_LOST_AFTER_MS
        : VM_LOOP_LOST_AFTER_MS;
      const lost =
        row.local_exec || row.loop_command_id
          ? (agedMs(row.last_activity_at) ?? 0) >= loopLostAfterMs &&
            (agedMs(row.started_at) ?? 0) >= loopLostAfterMs
          : (agedMs(row.started_at) ?? 0) >= VM_LOOP_UNLAUNCHED_AFTER_MS;
      if (!lost) continue;
    }

    /**
     * STAMP FIRST, THREAD THEN — the reverse order of the original, and
     * it's a production lesson.
     *
     * The argument before was: "if the stamp fails behind, the user
     * will still have read why for his turn stopped.” But the only way
     * this stamp fails is by keeping it `status in ('running')`, that is:
     * **someone finished this run in the meantime**. The round then didn't stop
     * at all — it just ended. So we wrote a failure message
     * in a conversation that ended well, and that's what we read
     * on the run of PR 51.
     *
     * What we lose is a case that doesn't exist: a refused stamp left, in
     * the old order, an orphan error; in this one, the following passage of the
     * drain will see the run again if it really remained `running`.
     *
     * The CHECKPOINT IS NOT TOUCHED: the one at the base is the last
     * saved periodically by the loop, at a boundary of safe round.
     * This is exactly what the next round should start from.
     */
    const stamped = await stampRun(
      row.id,
      {
        status: "failed",
        error_message: "The agent process stopped unexpectedly",
        continuations: 0,
        attempts: 0,
        last_activity_at: new Date().toISOString(),
        interrupt_requested: false,
        loop_command_id: null,
      },
      {
        expected: {
          started_at: row.started_at,
          last_activity_at: row.last_activity_at,
          loop_command_id: row.loop_command_id,
          sandbox_id: row.sandbox_id,
        },
      },
    );
    if (!stamped) continue; // course : quelqu'un a conclu entre-temps.

    await appendEvent(row.id, "error", {
      code: "turnLost",
      message:
        "This turn's process stopped before it could finish. The session was restored from its last save — send a message to carry on.",
    }).catch(() => {});

    /**
     * THE COMPUTE OF THE MICROVM, AND THIS IS WHERE NOBODY WOULD CHARGE IT.
     *
     * In the new form, the wall-clock of the VM is held by the loop and
     * reported in its end-of-turn report (`vm-rest.ts`) — and the function ne
     * charges nothing more on its side.
     * A round whose process dies never returns this report: without this line,
     * wake-up, clone and microVM hours exit all counters
     * silently. This is the computed half of the bill, on the only path where
     * one would not notice.
     *
     * NO DOUBLE COUNTING WITH THE END OF TURN REPORT, and it is the ORDER of the
     * two gestures which guarantees it, not luck. Here we stamp THEN we invoice
     * (`if (!stamped) continue`, just above); `landVmTurn` does the opposite.
     * A turn which returns its report while we believe it to be dead therefore fails
     * our guard (`status in ('running')`) and we write nothing. And the symmetrical case
     * does not arise: our verdict IS "the process has rendered", or a
     * process which has rendered no longer posts.
     *
     * From `started_at` to NOW, and it is a MINORANT despite appearances :
     * the microVM SESSION survives its loop process, and will only be cut by
     * by the inactivity reaper — ~5 min after this stamp, which has just finished
     * making the run idle. We therefore charge less than what the
     * platform charges us, which is the common sense of the error.
     *
     * AND NOTHING AT ALL FOR A LOCAL RUN (MIN-355): there was no microVM.
     * Charge here for `sandbox_compute` on Mac minutes would amount to making
     * paying the user for a machine that he himself provided - and making it
     * paying precisely on the path to the incident, the one that we do not reread.
     * The terminal is SERVER, never a figure that the harness would give: it is the
     * same principle as `sandboxMs`, and it is all the more valid here if the machine
     * is the one we suspect.
     */
    const startedMs =
      row.started_at && !row.local_exec ? Date.parse(row.started_at) : NaN;
    if (Number.isFinite(startedMs) && Date.now() > startedMs) {
      const billTo: AiUsageBillTo = row.created_by
        ? { userId: row.created_by }
        : { unattributed: `run ${row.id} sans created_by` };
      await recordSandboxUsage({
        runId: row.run_id ?? row.id,
        // Same seq strip as the other two compute writers: one run
        // migrated does not collide with the lines of its past.
        seq: SANDBOX_USAGE_SEQ_BASE + row.continuations,
        billTo,
        feature: row.routine_id ? "routine_compute" : "sandbox_compute",
        projectId: row.project_id,
        durationMs: Date.now() - startedMs,
      }).catch((err) =>
        console.error(
          "[agent-drain] vm compute metering failed:",
          (err as Error).message,
        ),
      );
    }

    /**
     * THE SPEND COLUMN, PACKED TO THE LEDGER — what `landVmTurn` does on the
     * healthy path (`vm-rest.ts`, the `Math.max` of the end-of-turn report) and that
     * no one did here. `cost_usd` is only written by healthy outputs:
     * a round whose process dies therefore leaves the line at what it was worth
     * before the round, that is to say **zero** on a first round — while the
     * ledger carries each round billed before the accident.
     *
     * Measured in production on the opencode observation window (MIN-286):
     * three runs harvested, `cost_usd = 0` on the three, **$0.159** to the ledger.
     * Nothing was lost for the bill (`finance.ts` reads the ledger) nor for the
     * ceilings (`control-plane.ts` and `execute.ts` already take the MAX of the two),
     * but the run line — what a human rereads after an incident — announced
     * free a round which does not was not.
     *
     * AFTER `recordSandboxUsage`, so that the sum read also carries the compute
     * that we have just written. And a MAX, not an allocation: the ledger and the
     * column are two lower bounds, a displayed expense never goes backwards.
     */
    const spent = await spentFromLedger(row.run_id ?? row.id).catch(() => null);
    if (spent != null && spent > row.cost_usd) {
      await service
        .from("agent_runs")
        .update({ cost_usd: spent })
        .eq("id", row.id)
        .lt("cost_usd", spent);
    }

    if (row.provider_key_id) {
      await revokeRunKey(row.provider_key_id);
      await service
        .from("agent_runs")
        .update({ provider_key_id: null })
        .eq("id", row.id)
        .eq("provider_key_id", row.provider_key_id);
    }
    await notifyAgentRun(row, "agent_failed").catch(() => {});
    reaped++;
  }
  return { reaped };
}

/**
 * Restricts a queue request to the scope of the current deployment (MIN-165).
 * BOTH queue requests pass through here: if they diverged, a drain
 * would see work due to not having the right to claim and would exit empty.
 *
 * Generic NOT constrained, with the cast inside: constraining `Q` on the
 * form of `is`/`eq` explodes the inference on the Postgrest builder (TS2589),
 * and returning a minimal interface would lose `order`/`limit` to the caller.
 */
function scopeToDeployment<Q>(query: Q, scope: string | null): Q {
  const q = query as unknown as {
    is(column: string, value: null): unknown;
    eq(column: string, value: string): unknown;
  };
  return (
    scope === null
      ? q.is("deployment_url", null)
      : q.eq("deployment_url", scope)
  ) as Q;
}

export async function drainAgentRuns(
  service: SupabaseClient,
  opts?: {
    /** CE drain wall budget. Must remain under the `maxDuration` of the route which
     * calls it: it is the caller, and he alone, who knows his own duration. */
    budgetMs?: number;
  },
): Promise<{ claimed: number }> {
  const deadline = Date.now() + (opts?.budgetMs ?? DRAIN_TIME_BUDGET_MS);
  // Deployment perimeter (MIN-165): resolved ONE time, it does not move one
  // loop turn to another. The two sweepers remain OVERALL: neither the observation
  // death nor cutting of a microVM at rest does not depend on logic
  // of agent, and the scoper would let the VM of a run preview run until
  // timeout de session.
  const scope = currentDeploymentScope();
  let claimed = 0;

  // THE watchdog, and there is only one left (MIN-225): `requeueStuckRuns`
  // presumed the death of a run after twenty minutes of silence, which has no
  // meaning for a tower that lives in the microVM and can work for an hour without
  // write an event. This does not assume anything, it ASKS the platform if the
  // process lives. Best effort — a failed death certificate is made up for in passing
  // next, an exception here would kill the entire drain.
  await reapDeadVmRuns(service).catch((err) =>
    console.error("[agent-drain] vm watchdog failed:", (err as Error).message),
  );
  // Release microVMs from inactive idle sessions (keep snapshot).
  await reapIdleSandboxes(service).catch((err) =>
    console.error("[agent-drain] reap failed:", (err as Error).message),
  );

  while (deadline - Date.now() >= MIN_LAUNCH_BUDGET_MS) {
    /**
     * ⚠ **DRAIN NEVER TAKES A LOCAL RUN** (MIN-293).
     *
     * `agent_runs.local_exec` is frozen on launch and says "this trick is playing on someone's
     * machine" ([local-exec-scope.ts](local-exec-scope.ts)). Without
     * this line, the drain claims it like the others and runs it in a
     * microVM: the user requested his machine, he obtains the cloud, **and
     * nothing tells him**. This is the exact fault that this site is fighting everywhere
     * elsewhere — something that is deteriorating without us knowing it.
     *
     * The corollary is assumed and it belongs to MIN-294: as long as the presence
     * and the claim do not exist, a local run that no machine claims remains
     * `queued`. It's a pending run, not a betrayed run — and the fallback to the
     * cloud, when it exists, will be decided BEFORE the first turn (D1 decision),
     * never by playing it in the wrong place silently.
     */
    const { data } = await scopeToDeployment(
      service
        .from("agent_runs")
        .select("id")
        .eq("status", "queued")
        .not("local_exec", "is", true)
        .lte("not_before", new Date().toISOString()),
      scope,
    )
      .order("not_before", { ascending: true })
      .limit(10);
    const rows = (data ?? []) as Array<{ id: string }>;
    if (rows.length === 0) break;

    let didWork = false;
    for (const row of rows) {
      if (deadline - Date.now() < MIN_LAUNCH_BUDGET_MS) break;
      const run = await claimRun(row.id);
      if (!run) continue; // course perdue (autre drain/cron)
      claimed++;
      didWork = true;
      await executeAgentRun(run, { deadlineMs: deadline - Date.now() });
    }
    if (!didWork) break;
  }

  return { claimed };
}
