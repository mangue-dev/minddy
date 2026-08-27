import "server-only";

import { recordSandboxUsage } from "@/lib/server/usage";
import { spentFromLedger, type AiUsageBillTo } from "@/lib/server/ai-usage";

import { checkAgentQuota } from "./quota";
import { planProviderStall } from "./retry";
import { resolveRepoCloneTarget } from "./repo-access";
import { forgeFor } from "./forge";
import { revokeRunKey } from "./run-key";
import {
  notePrCommits,
  reopenIfRejectedWorkPushed,
  resolveRunPrefs,
  prRef,
  prTerm,
  MERGED_DURING_TURN_STRINGS,
  PUSH_FAILED_STRINGS,
  SANDBOX_USAGE_SEQ_BASE,
  type PrLandingContext,
} from "./pr-landing";
import {
  appendEvent,
  hasPendingRunMessages,
  clearInterrupt,
  notifyAgentRun,
  stampRun,
  stampRunResult,
  type AgentRun,
} from "./runs";
import type { EmitAgentEvent } from "./agent-contract";
import type { VmTurnReport } from "./vm/protocol";
import { localDiffPayload } from "./local-diff-payload";

/**
 * STOPPING A ROUND PLAYED IN THE MICROVM (MIN-224).
 *
 * The loop finished, pushed its work, and returned its report to the
 * control plane. Everything that follows requires the base and the forge — therefore the function, and
 * not the VM: the `files_changed` event, the reopening of a refused pull request
 *, the idling of the line, the notification, the compute footage.
 *
 * WHAT IS SIMPLER THAN BEFORE, and this is the ticket file. `executeAgentRun`
 * has EIGHT exits from quiesce, because a chunk can end up in eight ways — suspended,
 * deferred, running out of continuations, waiting for a failed provider... Here there
 * are FOUR, and these are the only ones that have ever made sense for
 * the user: the round has ended, it has been interrupted, it has failed, or the budget
 * is exhausted. Everything else was slicing plumbing.
 *
 * WHAT IS THE SAME, and should stay the same: the words, the events, the order.
 * Landing on the pull request goes through [pr-landing.ts](pr-landing.ts),
 * shared with the old form — this is what makes the criterion of
 * toggle of the framing (“the thread says the same thing on the same ticket”) verifiable.
 */

/**
 * THE COMPUTE METAGE IS A DURATION, NOT A STATEMENT (MIN-329).
 *
 * `report.sandboxMs` is a number that the microVM sends that becomes
 * directly in the account of the owner of the run
 * (`recordSandboxUsage`: minutes × price). A VM whose loop was hijacked
 * therefore charged someone else what it wanted. No VM lives longer
 * than its own timeout (`SANDBOX_TIMEOUT_MS`, sandbox.ts, 24 h):
 * beyond that, it is no longer a clock, and we cut it. Copyed rather than imported —
 * `sandbox.ts` pulls the Vercel SDK, which has nothing to do in this path.
 */
export const MAX_SANDBOX_MS = 24 * 60 * 60_000;

/**
 * WHAT WE CHARGE COMPUTE FOR THIS ROUND — the general rule, written once
 * (MIN-360):
 *
 * **No value with financial consequences comes from a local process
 * without bound server.**
 *
 * Two terminals, and they do not say the same thing:
 *
 * - **a LOCAL run charges NOTHING.** There was no microVM: the wall-clock
 * returned is that of the user's Mac, and convert it to dollars
 * would be like making him pay for a machine that he himself provided. The mark
 * "run local" is that of the LINE (`agent_runs.local_exec`, placed at
 * launch), never a field of the report - the report comes from the process that one
 * suspects, and a diverted harness would be called cloud;
 * - **a cloud run is capped** at the lifetime of a microVM. Beyond that, this
 * is no longer a clock.
 *
 * The watchdog ([drain.ts](drain.ts)) holds the same rule on its own
 * path, and it holds it even better: it calculates the duration since `started_at`,
 * so the clock there is that of the end-to-end server.
 */
export function billableSandboxMs(reported: number, opts: { localExec: boolean }): number {
  if (opts.localExec) return 0;
  if (!Number.isFinite(reported)) return 0;
  return Math.min(Math.max(0, reported), MAX_SANDBOX_MS);
}

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/**
 * Lands the trick. Never ROSE to the HTTP caller on a detail: what matters is that the run line leaves `running`. A missed event, a PR not
 * reopened, a lost notification are degradations; a run left
 * `running` is a conversation blocked until the watchdog passes.
 */
export async function landVmTurn(run: AgentRun, report: VmTurnReport): Promise<void> {
  const emit: EmitAgentEvent = (type, payload) => appendEvent(run.id, type, payload);
  const nowIso = new Date().toISOString();

  const billTo: AiUsageBillTo = run.created_by
    ? { userId: run.created_by }
    : { unattributed: `run ${run.id} sans created_by` };

  /**
 * THE METAGE OF THE MICROVM, and it changes hands here (MIN-221 §3).
 *
 * `recordSandboxUsage` charged the CHUNK wall-clock from the `finally` of
 * function. Without chunk, no one keeps this clock anymore: it is the
 * loop which keeps it, in the VM, from the start to the end of the round, and which brings it back
 * in its report. **It's the computed half of the invoice** — it
 * would disappear silently if we forgot it, and no one would notice
 * before comparing the margin to the Vercel invoice.
 *
 * Written BEFORE the rest: the rest can fail, this line must not not.
 *
 * AND BOUNDED ON THE SERVER SIDE (MIN-360): `billableSandboxMs` reads the mark of the
 * LINE, not the report — a local run does not charge any compute, and a report
 * which claims the opposite has no voice in the chapter.
 */
  const sandboxMs = billableSandboxMs(report.sandboxMs, { localExec: !!run.local_exec });
  if (sandboxMs > 0) {
    await recordSandboxUsage({
      runId: run.run_id ?? run.id,
      // The seq band is that of the `sandbox_compute` lines; one turn = one
      // line, indexed by the lap counter that is `continuations` on the
      // line of the run (still 0 in the new form, but the strip remains
      // this one so that a migrated run does not collide with its past).
      seq: SANDBOX_USAGE_SEQ_BASE + run.continuations,
      billTo,
      feature: run.routine_id ? "routine_compute" : "sandbox_compute",
      projectId: run.project_id,
      durationMs: sandboxMs,
    }).catch(() => {});
  }

  // The checkpoint had to drop the CONVERSATION to fit within its size: that’s
  // said, otherwise the agent seems to have forgotten everything for no reason in the next round. THE
  // levels from before (girl histories, images, tool outputs) do not lose
  // only what is re-askable and cannot be said.
  if (report.checkpointDropped.includes("history")) {
    await emit("error", {
      code: "turnHistoryReset",
      message:
        "This session's history grew too large to carry over and had to be reset. The work is kept; the next turn starts fresh.",
      dropped: report.checkpointDropped,
    });
  }

  const { locale } = await resolveRunPrefs(run);

  // Push failed → SIGNAL VISIBLE. A non-fast-forward rejection is not transient
  // (someone pushed on the agent's branch): without signal, each turn
  // would re-fail silently and the user would believe the work delivered.
  if (report.pushError) {
    await emit("error", {
      message: PUSH_FAILED_STRINGS[locale](
        cap(report.pushError, 300),
      ),
    });
  }

  // Landing on the pull request. Best-effort end-to-end: the work
  // is already on the repository at this point, and a run that remains `running` because the
  // forge responds 502 would be a much worse evil.
  const prState = { number: run.pr_number, url: run.pr_url, state: run.pr_state };
  await landOnPullRequest(run, report, prState, emit, locale).catch((err) => {
    console.error("[agent-vm-rest] pull request landing failed:", (err as Error).message);
  });

  // The diff of the round, calculated by git IN the VM (the function no longer has the repository).
  if (report.changed && (report.changed.files.length > 0 || report.changed.diff)) {
    await emit("files_changed", {
      files: report.changed.files,
      truncated: report.changed.truncated,
      ...(report.changed.diff ? { diff: localDiffPayload(report.changed.diff) } : {}),
    });
  }

  // ── Resting ─────────────────────────── ────────────────────────────
  /**
 * What the run expense is REALLY worth, read from the ledger (MIN-215) rather than
 * accumulated on the column. The column is only written by healthy outputs;
 * the ledger is written call by call, including by a turn that is dead
 * without stamping anything. The MAX of the two: these are two lower bounds, the larger
 * is the truest, and a displayed expense must never decrease.
 */
  const ledger = await spentFromLedger(run.run_id ?? run.id).catch(() => null);
  const newCost = Math.max(run.cost_usd + report.costUsd, ledger ?? 0);

  const restFields = {
    continuations: 0,
    attempts: 0,
    cost_usd: newCost,
    /**
 * The checkpoint is only written if the report has one. A report of
 * RESCUE (the turn raised) does not carry any: the one in base comes from the
 * periodic backup, at a safe round boundary, and overwriting it with
 * the history left in the middle of a round would give the next turn a
 * `tool_call` without sound `tool_result` — plus the loss of `lastFilesSha`, therefore
 * a turn diff recalculated from the wrong base.
 */
    ...(report.checkpoint ? { checkpoint: report.checkpoint } : {}),
    // The microVM remains HOT (the reaper will shut it down after ~5 min of inactivity):
    // this is what makes hot restart instantaneous on the following message.
    sandbox_stopped_at: null,
    last_activity_at: nowIso,
    interrupt_requested: false,
    awaiting_input: false,
    // The loop process is finished. Leaving your ID on the line would cause you to notice
    // to the watchdog a death on a run already at rest, on each pass.
    loop_command_id: null,
  } satisfies Partial<Parameters<typeof stampRun>[1]>;

  /**
 * A steering message arrived AFTER the last round border (during
 * the push, during this report): we RE-QUEUE instead of resting, and the drain
 * will restart a turn which will drain it immediately. Otherwise the message would remain in
 * queue with no one to read it — a user who writes and gets nothing.
 */
  const restStamp = async (extra: Partial<Parameters<typeof stampRun>[1]>): Promise<boolean> => {
    const pending = await hasPendingRunMessages(run.id).catch(() => false);
    await stampToRest({
      status: pending ? "queued" : "completed",
      ...restFields,
      ...(pending ? { not_before: new Date().toISOString() } : {}),
      ...extra,
    });
    return pending;
  };

  /**
 * THE STOP MUST SUCCEED, EVEN IF THE BASE REFUSES THE CHECKPOINT (MIN-286).
 *
 * `stampRun` swallows its error: a refusal left the run `running` while the
 * VM had just submitted his report and was about to die - no one left to conclude, a conversation frozen on the screen, and the watchdog who ended up classifying it as "the process has stopped". It happened on 2026-08-12, on a
 * zero byte in the opencode log.
 *
 * We therefore try again WITHOUT the checkpoint, which is the only large field and comes from the
 * model. What we then lose is the memory of the last round - the one that the base
 * refused anyway -, and what we keep is an idle session, which a
 * message wakes up.
 */
  async function stampToRest(fields: Parameters<typeof stampRun>[1]): Promise<void> {
    const first = await stampRunResult(run.id, fields);
    if (!first.failed) return;
    console.error("[agent-vm-rest] rest stamp refused — retrying without the checkpoint");
    const { checkpoint: _dropped, ...withoutCheckpoint } = fields;
    const second = await stampRunResult(run.id, withoutCheckpoint);
    if (second.failed) {
      console.error("[agent-vm-rest] rest stamp refused TWICE — the watchdog will close this run");
      return;
    }
    await Promise.resolve(
      emit("error", {
        code: "checkpointRefused",
        message:
          "This turn's memory could not be saved, so the session restarts from its previous state. Its work is pushed on the branch.",
      }),
    ).catch(() => {});
  }

  if (report.status === "budget_exhausted") {
    await emitBudgetExhausted(run, emit);
    // Volontairement PAS `restStamp` : celui-ci re-queue s'il reste du steering,
    // which would immediately restart a tour without a budget. The message is waiting.
    await stampToRest({ status: "completed", ...restFields });
    await notifyAgentRun(run, "agent_failed");
    await revokeKey(run);
    return;
  }

  if (report.status === "interrupted") {
    await clearInterrupt(run.id).catch(() => {});
    await restStamp({});
    await revokeKey(run);
    return;
  }

  if (report.status === "error") {
    /**
 * THE FAILED SUPPLIER IS NOT END OF TURN (MIN-219), and it is this
 * that this path had lost.
 *
 * The loop has exhausted its call restarts (4 tries, ≤ 3.5 s cumulative): this
 * round didn't move anything forward, it WAITED. He therefore does not rest - he
 * leaves in line with a deadline ahead of him, and the waiting counter travels
 * on the checkpoint, the only state which crosses two turns. Without this delay, the
 * drain would immediately reclaim and fall back into the same failure at the
 * second.
 *
 * The counter is read on the LINE, and the checkpoint to write comes from the
 * REPORT: the two are not the same object, and confusing them is enough to
 * make the wait infinite. That of the report is rebuilt anew by
 * `buildCheckpoint` ([vm/turn.ts](vm/turn.ts)), which does not know this
 * field — reading it there would start from 1 at each failure, and `MAX_PROVIDER_REQUEUES`
 * would no longer limit nothing.
 *
 * This is also what makes the count CONSECUTIVE without coding anything for: any
 * putting to rest writes a checkpoint which does not carry the field, so a turn
 * which advances resets the counter to zero by itself.
 *
 * EXCEPT if a message is waiting: the user who writes during the outage is the
 * only signal worth trying again straight away. The counter rises when
 * even — the emergency exit remains limited.
 */
    const stallCheckpoint =
      report.errorCode === "providerUnavailable" ? (report.checkpoint ?? run.checkpoint) : null;
    // No checkpoint at all ⇒ no re-queue: the counter would have zero
    // where to travel, and unbounded waiting is worse than honest rest.
    const stall = stallCheckpoint
      ? planProviderStall(run.checkpoint?.providerRetries ?? 0)
      : null;
    if (stallCheckpoint && stall?.requeue) {
      const steering = await hasPendingRunMessages(run.id).catch(() => false);
      await stampRun(run.id, {
        ...restFields,
        status: "queued",
        checkpoint: { ...stallCheckpoint, providerRetries: stall.retries },
        not_before: new Date(Date.now() + (steering ? 0 : stall.delayMs)).toISOString(),
      });
      // No events here: the thread already bears the note “the supplier hiccuped”
      // that the loop has just issued (`status: transient_error`), and it says
      // true — the round starts again. A `error` on top would announce a stop which
      // does not take place. This is word for word what the old form does.
      await revokeKey(run);
      return;
    }

    /**
 * A CODE, translated by the thread — the SAME as the old form
 * ([execute.ts](execute.ts)), so that the trick is told the same on both
 * sides. Without this event, the end of the turn was MUTE: `error_message` is
 * read by nothing in `components/agent/`, it is only exposed by the API.
 *
 * The fallback in English is that of a client who does not know the code
 * (and the readable trace in the events table) — the sentence that the user
 * reads comes from `ERROR_CODE_KEYS` and the two catalogs.
 */
    if (report.errorCode) {
      await emit("error", {
        code: report.errorCode,
        message:
          report.errorCode === "providerUnavailable"
            ? "The model provider kept failing, so this turn was paused. Send a message to carry on."
            : "This turn reached its time limit. Send a message to carry on.",
      });
    }
    const pending = await restStamp({
      error_message: report.errorMessage ? cap(report.errorMessage, 1000) : null,
    });
    if (!pending) await notifyAgentRun(run, "agent_failed");
    await revokeKey(run);
    return;
  }

  // Fin de tour NATURELLE.
  const pending = await restStamp({
    outcome: report.reply ? cap(report.reply, 4000) : null,
    // Round ended on a `ask_user` → the session WAITS: yellow dot on the
    // surfaces until the user responds.
    ...(report.askedUser ? { awaiting_input: true } : {}),
    ...(report.pushError ? { error_message: cap(report.pushError, 1000) } : {}),
  });
  if (!pending) {
    await notifyAgentRun(run, report.askedUser ? "agent_question" : "agent_done");
  }
  await revokeKey(run);
}

/**
 * The LLM key of the run no longer has anyone to use it: the loop process is
 * dead. Revoked here rather than waiting for the inactivity reaper — this one also revokes it (five minutes later), but in between the key remains alive
 * on a microVM that the model can still reach if it left a job of
 * in the background. Best-effort and idempotent.
 */
async function revokeKey(run: AgentRun): Promise<void> {
  if (!run.provider_key_id) return;
  await revokeRunKey(run.provider_key_id).catch(() => {});
  await stampRun(run.id, { provider_key_id: null }, { guard: ["completed", "queued"] }).catch(
    () => {},
  );
}

/**
 * What the push of the round changes on the pull request side: the branch saved at the
 * first actual push, the rejected PR reopened, the commits traced to the ticket, and the
 * note of the special case — a PR merged DURING the round, whose work
 * pushed no longer belongs to nothing.
 */
async function landOnPullRequest(
  run: AgentRun,
  report: VmTurnReport,
  prState: { number: number | null; url: string | null; state: AgentRun["pr_state"] },
  emit: EmitAgentEvent,
  locale: Awaited<ReturnType<typeof resolveRunPrefs>>["locale"],
): Promise<void> {
  if (!report.pushed?.pushed) return;

  const target = await resolveRepoCloneTarget(run.project_id);
  if (!target) return;

  // The branch only exists for the app from the first REAL push: it's him
  // which creates it on the repository (MIN-123).
  if (!run.branch_name && report.workBranch) {
    await stampRun(run.id, { branch_name: report.workBranch }).catch((err) => {
      console.error("[agent-vm-rest] branch stamp failed:", (err as Error).message);
    });
  }

  const issueIdentifier = await identifierOf(run);
  const ctx: PrLandingContext = {
    run,
    target,
    forge: forgeFor(target.provider),
    issue: issueIdentifier ? { identifier: issueIdentifier } : null,
    workBranch: report.workBranch || (run.branch_name ?? ""),
    baseBranch: run.base_branch ?? target.defaultBranch,
    locale,
    emit,
    prState,
  };

  await reopenIfRejectedWorkPushed(ctx, report.pushed, target.token);
  // AFTER reopening: it resets `prState` on the base, therefore a push which
  // resurrects a rejected PR and tells it about the good PR.
  await notePrCommits(ctx, report.pushed);

  if (report.pushed.remoteUpdated && prState.state === "merged" && prState.number != null) {
    await emit("error", {
      message: MERGED_DURING_TURN_STRINGS[locale](
        prRef(target.provider, prState.number),
        prTerm(target.provider),
      ),
    });
  }
}

/** L'identifiant lisible du ticket du run (`MIN-42`), ou null hors run de ticket. */
async function identifierOf(run: AgentRun): Promise<string | null> {
  if (!run.issue_id) return null;
  const { getServiceClient } = await import("@/lib/supabase-service");
  const { data } = await getServiceClient()
    .from("issues")
    .select("number, projects(key)")
    .eq("id", run.issue_id)
    .maybeSingle();
  const row = data as { number?: number; projects?: { key?: string } | null } | null;
  return row?.projects?.key && row.number ? `${row.projects.key}-${row.number}` : null;
}

/**
 * The "exhausted budget" card, word for word that of the old form: two
 * causes behind the same border, and they are not resolved the same - the
 * budget of the ACCOUNT is at zero (wait, go up plan, switch to BYOK), or
 * it is the ceiling placed on THIS run which has bitten, and the account will very good.
 */
async function emitBudgetExhausted(run: AgentRun, emit: EmitAgentEvent): Promise<void> {
  const quota = await checkAgentQuota(run.created_by ?? "").catch(() => null);
  const accountRemainingUsd =
    quota && !quota.unlimited ? Math.max(0, quota.remaining ?? 0) : undefined;
  const runCapRemainingUsd =
    run.budget_usd == null ? undefined : Math.max(0, Number(run.budget_usd) - run.cost_usd);
  const cappedByRun =
    runCapRemainingUsd !== undefined &&
    (accountRemainingUsd === undefined || runCapRemainingUsd < accountRemainingUsd);
  await emit("quota_exhausted", {
    spent: quota?.spent ?? null,
    cap: quota?.cap ?? null,
    resetsAt: quota?.resetsAt ?? null,
    planId: quota?.planId ?? null,
    nextPlanId: quota?.nextPlanId ?? null,
    byok: quota?.mode === "byok",
    cause: cappedByRun ? "run_cap" : "account",
    capPercent:
      cappedByRun && quota?.cap && run.budget_usd != null
        ? Math.round((Number(run.budget_usd) / quota.cap) * 100)
        : null,
  });
}
