import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { activeRunForChain, requestInterrupt } from "@/lib/server/agent/runs";
import {
  cancelPendingChain,
  latestChainForIssue,
  lastRunOfChain,
  resumeChain,
  type AgentChain,
} from "@/lib/server/automations/chain";
import { haltChain } from "@/lib/server/automations/report";
import { scheduleAutomations } from "@/lib/server/automations/engine";
import { estimateChainCost } from "@/lib/server/automations/estimate";
import {
  parseAutomationOverride,
  rulesForIssue,
  rulesForProject,
  simulateChain,
  simulatedRunModes,
  type AutomationSource,
} from "@/lib/automations";
import type { IssueEffort, IssuePriority, IssueStatus } from "@/lib/issue-constants";

/**
 * The ticket automation CHAIN ​​(MIN-147).
 * GET → its state (step, expenditure in budget share, reason for stopping), and — that a
 * chain is spinning or not — what the rules WOULD PLAY on this ticket, with
 * the estimate. This is the “estimate displayed before launching”.
 * POST → { action: "resume" | "stop" }. Two gestures, and only two: the
 * The rest is decided according to the rules, not piecemeal.
 *
 * `resume` only restarts from `awaiting_human` — it's the human green light, not
 * a “redo” button. `stop` works from any living state and
 * ALSO interrupts the current run: stop a chain by leaving its agent
 * finishing your turn would mean stopping nothing at all.
 */

type RouteContext = { params: Promise<{ id: string }> };

// The restart kicks the drain of the next run in `after()`: same window as the
// launch route, otherwise the function dies in the middle of the first round.
export const runtime = "nodejs";
export const maxDuration = 300;

interface IssueRow {
  id: string;
  project_id: string;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  plan: string | null;
  assignee_id: string | null;
  automation_override: unknown;
}

/** Customer view of a channel — never USD.
 * No ceiling share: there is no more (see lib/automations). */
function publicChain(chain: AgentChain) {
  return {
    id: chain.id,
    status: chain.status,
    preset: chain.preset,
    step: chain.step,
    retries: chain.retries,
    stopReason: chain.stop_reason,
    /** Suspended channel: the start time, for the countdown. */
    notBefore: chain.not_before,
    createdAt: chain.created_at,
    updatedAt: chain.updated_at,
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS: The caller must be able to see the ticket.
  const { data: issueRow } = await auth.supabase
    .from("issues")
    .select(
      "id, project_id, status, priority, effort, plan, assignee_id, automation_override",
    )
    .eq("id", id)
    .maybeSingle();
  if (!issueRow) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  const issue = issueRow as IssueRow;

  const service = getServiceClient();
  const [{ data: project }, chain, { data: categoryRows }] = await Promise.all([
    service
      .from("projects")
      .select("id, owner_id, automations_enabled, automations")
      .eq("id", issue.project_id)
      .maybeSingle(),
    latestChainForIssue(id),
    service.from("issue_categories").select("category_id").eq("issue_id", id),
  ]);

  // Same cascade as the engine: ticket > project > owner preset.
  const ownerMeta = project
    ? ((await service.auth.admin.getUserById(project.owner_id as string)).data?.user
        ?.user_metadata ?? null)
    : null;
  const rules = rulesForIssue(
    rulesForProject(project?.automations, ownerMeta as Record<string, unknown> | null),
    parseAutomationOverride(issue.automation_override),
  );
  const facts = {
    status: issue.status,
    effort: issue.effort,
    priority: issue.priority,
    plan: issue.plan,
    assigneeId: issue.assignee_id,
    categoryIds: ((categoryRows ?? []) as Array<{ category_id: string }>).map(
      (r) => r.category_id,
    ),
  };

  // What the rules would do if the ticket restarted from its current status:
  // this is the promise displayed before launching, and it must be read without having
  // triggered anything.
  const planned = simulateChain(rules, facts, { throughHumanStop: true });
  const estimate =
    project && planned.length > 0
      ? await estimateChainCost({
          projectId: issue.project_id,
          ownerId: project.owner_id as string,
          rules,
          issue: facts,
        })
      : null;

  return NextResponse.json({
    enabled: !!project?.automations_enabled,
    chain: chain ? publicChain(chain) : null,
    plannedModes: simulatedRunModes(planned),
    estimate: estimate
      ? {
          shareOfMonthlyBudget: estimate.shareOfMonthlyBudget,
          fromHistory: estimate.fromHistory,
        }
      : null,
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data: issue } = await auth.supabase
    .from("issues")
    .select("id, project_id")
    .eq("id", id)
    .maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = (body as { action?: unknown } | null)?.action;
  if (
    action !== "resume" &&
    action !== "stop" &&
    action !== "start" &&
    action !== "handoff"
  ) {
    return NextResponse.json(
      { error: "action must be 'resume', 'start', 'stop' or 'handoff'" },
      { status: 400 },
    );
  }

  const chain = await latestChainForIssue(id);

  // “Take your hand” — sent by hand gestures that do NOT move
  // the ticket (copy the plan prompt, verification, a free instruction).
  // Silent NO-OP when there is nothing to cancel: the caller pulls this signal to
  // each copy, without knowing if there is a string, and a 404 would
  // log an error for a perfectly normal case.
  if (action === "handoff") {
    if (chain?.status === "pending") await cancelPendingChain(chain.id, "taken_over");
    return NextResponse.json({ ok: true });
  }

  if (!chain) return NextResponse.json({ error: "No chain on this issue" }, { status: 404 });

  if (action === "stop") {
    // A suspended channel cancels silently: it has played nothing, nothing
    // spent, and a “chain stopped” report for never working
    // started would only clutter up the ticket.
    if (chain.status === "pending") {
      const cancelled = await cancelPendingChain(chain.id, "canceled");
      return NextResponse.json({
        ok: true,
        chain: cancelled ? publicChain(cancelled) : null,
      });
    }
    // The current run goes with her — but ONLY if it's hers. Without this
    // test, stopping a parked channel interrupted the session that the user
    // had launched by hand to do the work itself: the gesture “I
    // get rid of automation” killed his own agent.
    const active = await activeRunForChain(chain.id);
    if (active) await requestInterrupt(active.id);
    await haltChain(chain, "interrupted");
    const after = await latestChainForIssue(id);
    return NextResponse.json({ ok: true, chain: after ? publicChain(after) : null });
  }

  if (action === "start") {
    // “Launch now”: we short-circuit the reprieve. The engine re-checks
    // even though the ticket remained where it was — it's a shortcut, not
    // a shortcut around the rule.
    if (chain.status !== "pending" || !chain.pending_event?.to) {
      return NextResponse.json({ error: "Chain is not waiting to start" }, { status: 409 });
    }
    scheduleAutomations({
      issueId: id,
      projectId: issue.project_id as string,
      chainId: chain.id,
      startPending: true,
      event: {
        type: "status_changed",
        from: null,
        to: chain.pending_event.to as IssueStatus,
        source: chain.pending_event.source as AutomationSource,
      },
    });
    return NextResponse.json({ ok: true, chain: publicChain(chain) });
  }

  // resume — human approval, only from `awaiting_human`.
  const resumed = await resumeChain(chain.id);
  if (!resumed) {
    return NextResponse.json({ error: "Chain is not waiting for a decision" }, { status: 409 });
  }

  // The rest is linked to the LAST run of the chain: this is the event that the
  // breakpoint had interrupted, and there is nothing else to attach it to.
  // No run at all (a rule that stops before running one): nothing has
  // failed, and saying so would trigger the engine to shut down on `run_failed`.
  const last = await lastRunOfChain(resumed.id);
  scheduleAutomations({
    issueId: id,
    projectId: issue.project_id as string,
    chainId: resumed.id,
    event: {
      type: "run_finished",
      intent: last?.intent ?? "plan",
      outcome: !last || last.status === "completed" ? "ok" : "failed",
    },
  });
  return NextResponse.json({ ok: true, chain: publicChain(resumed) });
}
