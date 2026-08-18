import "server-only";

import { after } from "next/server";

import { getServiceClient } from "@/lib/supabase-service";
import { canUseAutomations } from "@/lib/server/entitlements";
import {
  activeRunForChain,
  requestInterrupt,
  type AgentRunVerdict,
} from "@/lib/server/agent/runs";
import { updateIssueFields } from "@/lib/server/update-issue";
import {
  automationModelFor,
  findImplementRule,
  isAutomationEffortEnabled,
  MAX_CHAIN_STEPS,
  MAX_VERIFICATION_RETRIES,
  nextRule,
  parseAutomationOverride,
  presetOfRules,
  rulesForIssue,
  rulesForProject,
  resolveAutomationStartDelayMinutes,
  rulesToReplayOnRetry,
  simulateChain,
  type AutomationEvent,
  type AutomationIssueFacts,
  type AutomationRule,
  type AutomationSource,
} from "@/lib/automations";
import type { IssueEffort, IssuePriority, IssueStatus } from "@/lib/issue-constants";
import {
  advanceChain,
  cancelPendingChain,
  chainForIssue,
  getChain,
  lastVerdictOfChain,
  openChain,
  retryChain,
  startPendingChain,
  type AgentChain,
} from "./chain";
import { runAction } from "./actions";
import { captureChainStarted, finishChain, haltChain } from "./report";

/**
 * The automations ENGINE (MIN-147), modeled after `lib/server/smart-assign.ts`:
 * a fire-and-forget entry point that does nothing other than program the
 * work after the response, and a runtime that RE-CHECKS EVERYTHING at the moment
 * it turns. The world was able to move between programming and execution —
 * switch cut, project deleted, ticket re-sorted, budget exhausted, run restarted
 * by hand — and each of these cases must be a silent no-op, not a failure.
 *
 * It only plays ONE rule per event (cf. `nextRule`): the action launched
 * will itself produce the following event, either by finishing its run (
 * end of run hook), or by changing the status (status hook). This is what makes
 * the loop observable — each step leaves a base trace before the next one.
 */

export interface AutomationRunParams {
  issueId: string;
  projectId: string;
  event: AutomationEvent;
  /**
 * String concerned when the caller knows it (end of run hook,
 * human recovery). Absent → that of the ticket, if he has a living one.
 */
  chainId?: string | null;
  /**
 * The call comes from the SCANNER (cron) or a “Run now”: it wakes up
 * a suspended chain. This is the only path that has the right to start it, and
 * it first re-checks that the condition that opened it still holds.
 */
  startPending?: boolean;
}

/**
 * Fire-and-forget entry point. Off the critical path, like
 * `scheduleSmartAssign` — and with the same net as `update-issue`: outside of a
 * query (the engine cascades itself), `after()` raises, and the
 * job then leaves directly.
 */
export function scheduleAutomations(params: AutomationRunParams): void {
  const go = () =>
    runAutomations(params).catch((e) =>
      console.error("[automations] run failed:", (e as Error).message),
    );
  try {
    after(go);
  } catch {
    void go();
  }
}

/**
 * Statuses that say "this ticket is no longer in work": put away, abandoned,
 * or handmade. `todo`, `in_progress` and `in_review` are absent — these
 * are the ones that the chain passes through itself.
 */
const CHAIN_STAND_DOWN_STATUSES: IssueStatus[] = [
  "backlog",
  "triage",
  "canceled",
  "duplicate",
  "done",
];

/** Origins that amount to “someone took back control” — cf. `AUTOMATION_SOURCES`. */
const HUMAN_STAND_DOWN_SOURCES: AutomationSource[] = ["web", "numo"];

interface IssueRow {
  id: string;
  number: number;
  title: string;
  plan: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  assignee_id: string | null;
  automation_override: unknown;
}

/**
 * TECHNICAL actor of the chain: the assignee of the ticket if he is from the team,
 * otherwise the owner of the project. This is where the BYOK key, the quota, the
 * language and the notifications come from — not from who clicked, since no one clicked.
 * The DISPLAYED actor is the automation (`via_automation`).
 */
async function resolveChainOwner(
  projectId: string,
  ownerId: string,
  assigneeId: string | null,
): Promise<string> {
  if (!assigneeId || assigneeId === ownerId) return ownerId;
  const service = getServiceClient();
  const { data } = await service
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", assigneeId)
    .maybeSingle();
  return data ? assigneeId : ownerId;
}

/**
 * The project owner's `user_metadata` — this is where his
 * automation preset lives. Best effort: an unreadable account is worth “no preset”
 * (so no rule, so nothing is triggered), never a failure.
 */
async function ownerMetadata(ownerId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await getServiceClient().auth.admin.getUserById(ownerId);
    return (data?.user?.user_metadata ?? null) as Record<string, unknown> | null;
  } catch (err) {
    console.error("[automations] owner metadata read failed:", (err as Error).message);
    return null;
  }
}

async function categoryIdsOf(issueId: string): Promise<string[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("issue_categories")
    .select("category_id")
    .eq("issue_id", issueId);
  return ((data ?? []) as Array<{ category_id: string }>).map((r) => r.category_id);
}

/**
 * An implementation check that says NO. One restart, and only one: the
 * restart carries the report on file, so it knows what to correct; a
 * second failure on the same subject says the ticket needs a human, not
 * one more turn — stop, ticket in triage, report in comment.
 *
 * Returns `true` when it has taken control: the engine then does not consult the
 * rules (they would replay the next step of a work that we have just judged
 * not done).
 */
async function handleFailedVerification(params: {
  chain: AgentChain;
  rules: readonly AutomationRule[];
  verdict: AgentRunVerdict;
  issue: IssueRow;
  projectKey: string;
  /** Model set for the SIZE of this ticket. To be passed as on the normal
 * path: a restart remains a step in the same chain, on the same
 * ticket — restarting it with a model other than the one the user has
 * chosen for this size would have no reason to exist. */
  model: string | null;
}): Promise<boolean> {
  const { chain, verdict, issue } = params;

  if (chain.retries >= MAX_VERIFICATION_RETRIES) {
    await haltChain(chain, "verification_failed", {
      verdictSummary: verdict.summary,
      verdictBlockers: verdict.blockers,
    });
    // The ticket goes back to sorting: this is the place on the product that says
    // “someone has to watch this,” and the channel doesn’t care anymore.
    await updateIssueFields({
      issueId: issue.id,
      actorId: chain.owner_id,
      input: { status: "triage" },
      viaAssistant: true,
      viaAutomation: true,
    });
    return true;
  }

  const retried = await retryChain(chain, rulesToReplayOnRetry(params.rules));
  if (!retried) return true;

  // We replay the implementation rule — the one that `retryChain` just came from
  // demarcate — with the verification report as an additional deposit.
  const rule = findImplementRule(params.rules, {
    issue: factsOf(issue, await categoryIdsOf(issue.id)),
    playedRuleIds: retried.played_rule_ids,
  });
  if (!rule) {
    await haltChain(retried, "verification_failed", {
      verdictSummary: verdict.summary,
      verdictBlockers: verdict.blockers,
    });
    return true;
  }
  const advanced = await advanceChain(retried, rule.id);
  if (!advanced) return true;
  await runAction({
    chain: advanced,
    action: rule.then[0],
    issue: { ...issue, project_key: params.projectKey },
    extraPrompt: [
      verdict.summary,
      ...(verdict.blockers ?? []).map((b) => `- ${b}`),
    ]
      .filter(Boolean)
      .join("\n"),
    model: params.model,
  });
  return true;
}

/**
 * Turns off a string, regardless of its form. A SUSPENDED channel cancels in
 * silence: it has played nothing, spent nothing, and a report "the channel has stopped
 *" for a job never started would be noise on the ticket. A
 * chain that RUNS, it stops when you say so.
 *
 * Without this checkpoint, a project disarmed during a reprieve left the
 * chain `pending` forever — and the unique index per ticket with it.
 */
async function shutDownChain(chain: AgentChain, reason: string): Promise<void> {
  // The THREE living statuses, not two: `awaiting_human` was forgotten, so
  // that `stopChain` accepts it perfectly. Disarm the project, lose the
  // budget, remove the preset or set “do not automate” on the ticket
  // while a chain was parked left it parked FOREVER — and with
  // it the unique index of the ticket, so no more automation possible.
  if (chain.status === "pending") await cancelPendingChain(chain.id, reason);
  else await haltChain(chain, reason);
}

function factsOf(issue: IssueRow, categoryIds: string[]): AutomationIssueFacts {
  return {
    status: issue.status,
    effort: issue.effort,
    priority: issue.priority,
    plan: issue.plan,
    assigneeId: issue.assignee_id,
    categoryIds,
  };
}

export async function runAutomations(params: AutomationRunParams): Promise<void> {
  const service = getServiceClient();

  // ── The world, re-checked at runtime ────────────────────────────────────
  const { data: project } = await service
    .from("projects")
    .select("id, key, owner_id, automations_enabled, automations")
    .eq("id", params.projectId)
    .is("deleted_at", null)
    .maybeSingle();

  const existing = params.chainId
    ? await getChain(params.chainId)
    : await chainForIssue(params.issueId);

  // Project trashed: the chain no longer has an object. abandon it like
  // which left her alive forever — and, worse, at the head of the queue
  // sweeper (sorted by seniority), where a handful of dead chains was enough
  // to starve ALL automation from the platform.
  if (!project) {
    if (existing) await shutDownChain(existing, "gone");
    return;
  }

  if (!project.automations_enabled) {
    // The switch was cut while a chain was running: we cannot leave it
    // not in suspense, we stop it by saying it.
    if (existing) await shutDownChain(existing, "disabled");
    return;
  }
  if (!(await canUseAutomations(project.owner_id as string))) {
    if (existing) await shutDownChain(existing, "entitlement");
    return;
  }

  const { data: issueRow } = await service
    .from("issues")
    .select(
      "id, number, title, plan, status, priority, effort, assignee_id, automation_override",
    )
    .eq("id", params.issueId)
    .is("deleted_at", null)
    .maybeSingle();
  // Ticket in the trash: same reason, same remedy. And without that, a
  // restoring before the purge woke up a several-year-old channel
  // days, which launched a run that no one expected.
  if (!issueRow) {
    if (existing) await shutDownChain(existing, "gone");
    return;
  }
  const issue = issueRow as IssueRow;

  const override = parseAutomationOverride(issue.automation_override);
  const ownerMeta = await ownerMetadata(project.owner_id as string);
  // Cascade ticket > project > account: forcing the ticket wins, otherwise the
  // rules written on the project (API/MCP), otherwise the OWNER preset
  // of the project — it is he who pays and he alone who was able to arm this project.
  const rules = rulesForIssue(rulesForProject(project.automations, ownerMeta), override);

  // Efforts covered: a ticket of a size out of account does not trigger
  // Nothing. Tested AFTER the rules (one says what to play, the other on what), and
  // BEFORE everything else — it's a refusal, not a stop: if a chain was spinning
  // already, it was opened when the size was authorized, and we leave it
  // finish rather than abandoning it halfway.
  if (!existing && !isAutomationEffortEnabled(ownerMeta, issue.effort)) return;
  if (rules.length === 0) {
    if (existing) await shutDownChain(existing, "disabled");
    return;
  }

  // ── THE HUMAN TOOK THE TICKET ───────────────────── ──────────────────────
  // The most important guard in the system, and the one that was missing.
  //
  // The reprieve only protects the BOOT: from step 2, the chain
  // decides on `run_finished` triggers, whose conditions do not apply
  // only on the ticket (effort, priority, plan, etc.) and NEVER on its status. A
  // engaged channel therefore never again looked at where his ticket was — and the
  // status hook didn't catch anything, since it exits early when a run
  // work. Measured consequence: we cancel a ticket manually, the step in
  // class ends, the next one leaves anyway, and `syncIssueStatusOnAgentStart`
  // OVERWRITE the cancellation by returning it to “in progress”.
  //
  // The rule: a HUMAN gesture which removes the ticket from the work in progress removes the
  // chain. Restricted to human origins on purpose — the life cycle of a run
  // also writes statuses (`done` when merging a PR), and the loop does not
  // must not stop on its own success.
  if (
    existing &&
    params.event.type === "status_changed" &&
    HUMAN_STAND_DOWN_SOURCES.includes(params.event.source ?? "web") &&
    CHAIN_STAND_DOWN_STATUSES.includes(params.event.to)
  ) {
    // The current run leaves with it: letting it finish means continuing to
    // spend on a ticket that its owner has just put away.
    const working = await activeRunForChain(existing.id);
    if (working) await requestInterrupt(working.id);
    await shutDownChain(existing, "taken_over");
    return;
  }

  // A run of THIS CHANNEL is already working: nothing needs to be decided now.
  // An independent conversation that cites the same ticket is neither a lock nor
  // a progress signal for automation.
  // This safeguard is HERE, BEFORE waking up from reprieve and before menstruation.
  //
  // Before the reprieve, because waking up first and then giving up left
  // a string `running` at step 0, without a run to it: never scanned again (it
  // is no longer `pending`), never advanced again (no chain run will end), and
  // occupying the ticket's unique index forever. Left `pending`, it is
  // simply re-proposed on the next scan.
  //
  // Before the rules, because a manual status change during a run
  // turns does not match any rule: without this return, the string would be declared
  // COMPLETED while its stage is still running. (On the normal path, `stampRun`
  // has already made the run terminal when the hook calls: nothing is active and
  // ce test laisse passer.)
  if (existing && (await activeRunForChain(existing.id))) return;

  // ── The EN SURSIS channel ───────────────────────── ──────────────────────────
  // Semantics of `for:` of alerts: the condition must hold CONTINUOUSLY. At
  // wake up, the ticket must still be in the status that opened the channel.
  // This is the test that covers “I copied the implementation prompt” (the copy
  // move the ticket to `in_progress`), “I put it back in the backlog”, “I have it
  // class ". Manual gestures that DO NOT move the ticket — copy the ticket
  // plan prompt, launch a plan or a check manually — are not there
  // visible: these cancel the chain at the source (see `handOffToHuman`).
  let live = existing;
  let startedFromPending = false;
  if (live && live.status === "pending") {
    if (params.startPending) {
      if (live.pending_event && live.pending_event.to !== issue.status) {
        await cancelPendingChain(live.id, "superseded");
        return;
      }
      const started = await startPendingChain(live.id);
      if (!started) return; // someone else woke her up, or canceled her
      live = started;
      startedFromPending = true;
    } else if (
      params.event.type === "status_changed" &&
      live.pending_event &&
      params.event.to !== live.pending_event.to
    ) {
      // The ticket went elsewhere during the reprieve: the waiting channel
      // no longer relevant. We cancel it SILENTLY (she hasn't played anything, nothing
      // spent) and we let the new status be evaluated for itself.
      await cancelPendingChain(live.id, "superseded");
      live = null;
    } else {
      return;
    }
  }

  // A parked chain is waiting for a HUMAN: nothing automatic makes it leave.
  // The resume route puts it back into `running` BEFORE recalling the engine.
  if (live && live.status !== "running") return;

  const categoryIds = await categoryIdsOf(issue.id);
  const facts = factsOf(issue, categoryIds);
  const projectKey = (project.key as string) ?? "";

  // Analysis of the opening of a channel that left SURSIS: it goes to
  // true startup, not on hold — a chain canceled while it is
  // reprieve never started, and therefore should count for nothing.
  if (startedFromPending && live) {
    captureChainStarted(live, {
      effort: issue.effort,
      plannedSteps: simulateChain(rules, facts, { throughHumanStop: true }).length,
    });
  }

  // ── The verdict of an audit takes precedence over the rules ────────────────────
  if (live && params.event.type === "run_finished" && params.event.intent === "verify") {
    const verdict = await lastVerdictOfChain(live.id);
    if (verdict && !verdict.ok) {
      await handleFailedVerification({
        chain: live,
        rules,
        verdict,
        issue,
        projectKey,
        model: automationModelFor(ownerMeta, issue.effort),
      });
      return;
    }
  }

  // ── What remains to play ───────────────────────── ─────────────────────────
  const rule = nextRule(rules, {
    event: params.event,
    issue: facts,
    playedRuleIds: live?.played_rule_ids ?? [],
  });
  if (!rule) {
    // Nothing left to play — but two very different endings, which must be distinguished
    // HERE because it's the only place that still sees the event. A run
    // that ended FAILED does not match any rules (the presets do not
    // only react to `outcome: "ok"`): without this test, the chain was declared
    // “gone to the end” — report commentary and analytics included — then
    // that his step had just died. This is also what finally makes it enforceable
    // the `run_failed` pattern (see `STOP_REASONS`), and what the routing of
    // `requeueStuckRuns` towards `stampRun` promised: a run abandoned by the
    // sweeper STOPs its channel. (Without a string, it's just an event
    // which does not concern any rule.)
    if (live) {
      if (params.event.type === "run_finished" && params.event.outcome === "failed") {
        await haltChain(live, "run_failed");
      } else {
        await finishChain(live);
      }
    }
    return;
  }

  // ── The channel ────────────────────────────── ───────────────────────────────
  let chain = live;
  if (!chain) {
    const ownerId = await resolveChainOwner(
      project.id as string,
      project.owner_id as string,
      issue.assignee_id,
    );
    // ── THE RESPONSIBILITY ───────────────────────────── ──────────────────────────────
    // A change of status opens the WAITING channel: it will not start
    // only at the end of the deadline, and only if the ticket is still there. The reprieve does not
    // is only valid for STARTING — the end of a run continues the next step all
    // immediately, since we are already committed (and have already paid).
    const delayMin = resolveAutomationStartDelayMinutes(ownerMeta);
    const deferred =
      delayMin > 0 && params.event.type === "status_changed"
        ? {
            notBefore: new Date(Date.now() + delayMin * 60_000).toISOString(),
            pendingEvent: {
              to: params.event.to,
              source: params.event.source ?? "web",
            },
          }
        : null;
    chain = await openChain({
      projectId: project.id as string,
      issueId: issue.id,
      ownerId,
      preset: presetOfRules(rules),
      ...deferred,
    });
    // Null = another string was born in the meantime (unique index). We return the
    // hand: she is the one driving now.
    if (!chain) return;
    // On reprieve: nothing more here. It's the sweeper who will call her back, and
    // the opening analytics starts at REAL startup, not when put on hold.
    if (deferred) return;
    captureChainStarted(chain, {
      effort: issue.effort,
      plannedSteps: simulateChain(rules, facts, { throughHumanStop: true }).length,
    });
  }

  // ── The safeguard, just before spending ─────────────────────────────────
  // Only one: the step counter (anti-runaway). NO spending limit —
  // cutting a string in the middle is not readable for anyone looking at it; this is the
  // quota of the account which limits, globally and visibly.
  if (chain.step >= MAX_CHAIN_STEPS) {
    await haltChain(chain, "max_steps");
    return;
  }

  // ── The step ─────────────────────────────── ────────────────────────────────
  // Compare-and-set: if someone else has played it in the meantime, we don't start anything.
  const advanced = await advanceChain(chain, rule.id);
  if (!advanced) return;

  await runAction({
    chain: advanced,
    action: rule.then[0],
    issue: { ...issue, project_key: projectKey },
    // Model chosen by ticket SIZE (account setting). He prevails over
    // that of the rule: this is the setting that the user sees and manipulates.
    model: automationModelFor(ownerMeta, issue.effort),
  });
}
