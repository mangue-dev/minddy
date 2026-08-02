import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { activeRunForIssue, requestInterrupt } from "@/lib/server/agent/runs";
import {
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
  parseAutomations,
  rulesForIssue,
  simulateChain,
  simulatedRunModes,
} from "@/lib/automations";
import type { IssueEffort, IssuePriority, IssueStatus } from "@/lib/issue-constants";

/**
 * La CHAÎNE d'automatisation d'un ticket (MIN-147).
 *   GET  → son état (étape, dépense en part de budget, motif d'arrêt), et — qu'une
 *          chaîne tourne ou non — ce que les règles JOUERAIENT sur ce ticket, avec
 *          l'estimation. C'est l'« estimation affichée avant de lancer ».
 *   POST → { action: "resume" | "stop" }. Deux gestes, et seulement deux : le
 *          reste se décide dans les règles, pas au coup par coup.
 *
 * `resume` ne relance que depuis `awaiting_human` — c'est le feu vert humain, pas
 * un bouton « refaire ». `stop` marche depuis n'importe quel état vivant et
 * interrompt AUSSI le run en cours : arrêter une chaîne en laissant son agent
 * finir son tour, ce serait ne rien arrêter du tout.
 */

type RouteContext = { params: Promise<{ id: string }> };

// La reprise kicke le drain du prochain run dans `after()` : même fenêtre que la
// route de lancement, sinon la fonction meurt en plein premier round.
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

/** Vue client d'une chaîne — jamais d'USD, seulement sa part du budget. */
function publicChain(chain: AgentChain) {
  return {
    id: chain.id,
    status: chain.status,
    preset: chain.preset,
    step: chain.step,
    retries: chain.retries,
    stopReason: chain.stop_reason,
    /** Part du plafond de la chaîne déjà consommée, 0→1. */
    budgetUsed:
      chain.budget_usd && chain.budget_usd > 0
        ? Math.min(1, chain.spent_usd / chain.budget_usd)
        : null,
    createdAt: chain.created_at,
    updatedAt: chain.updated_at,
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS : l'appelant doit pouvoir voir le ticket.
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

  const rules = rulesForIssue(
    parseAutomations(project?.automations),
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

  // Ce que les règles joueraient si le ticket repartait de son statut actuel :
  // c'est la promesse affichée avant de lancer, et elle doit se lire sans avoir
  // déclenché quoi que ce soit.
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
  if (action !== "resume" && action !== "stop") {
    return NextResponse.json({ error: "action must be 'resume' or 'stop'" }, { status: 400 });
  }

  const chain = await latestChainForIssue(id);
  if (!chain) return NextResponse.json({ error: "No chain on this issue" }, { status: 404 });

  if (action === "stop") {
    // Le run en cours part avec elle : le drapeau d'interruption le ramène au
    // repos proprement, sans rien perdre du travail déjà poussé.
    const active = await activeRunForIssue(id);
    if (active) await requestInterrupt(active.id);
    await haltChain(chain, "interrupted");
    const after = await latestChainForIssue(id);
    return NextResponse.json({ ok: true, chain: after ? publicChain(after) : null });
  }

  // resume — feu vert humain, uniquement depuis `awaiting_human`.
  const resumed = await resumeChain(chain.id);
  if (!resumed) {
    return NextResponse.json({ error: "Chain is not waiting for a decision" }, { status: 409 });
  }

  // La suite se rattache au DERNIER run de la chaîne : c'est l'événement que le
  // point d'arrêt avait interrompu, et il n'y a rien d'autre à quoi la rattacher.
  const last = await lastRunOfChain(resumed.id);
  scheduleAutomations({
    issueId: id,
    projectId: issue.project_id as string,
    chainId: resumed.id,
    event: {
      type: "run_finished",
      intent: last?.intent ?? "plan",
      outcome: last?.status === "completed" ? "ok" : "failed",
    },
  });
  return NextResponse.json({ ok: true, chain: publicChain(resumed) });
}
