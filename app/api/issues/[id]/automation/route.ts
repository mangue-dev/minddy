import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { activeRunForIssue, requestInterrupt } from "@/lib/server/agent/runs";
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

/** Vue client d'une chaîne — jamais d'USD.
 *  Aucune part de plafond : il n'y en a plus (cf. lib/automations). */
function publicChain(chain: AgentChain) {
  return {
    id: chain.id,
    status: chain.status,
    preset: chain.preset,
    step: chain.step,
    retries: chain.retries,
    stopReason: chain.stop_reason,
    /** Chaîne en sursis : l'heure d'amorçage, pour le compte à rebours. */
    notBefore: chain.not_before,
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

  // Même cascade que le moteur : ticket > projet > préréglage du propriétaire.
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

  // « Je prends la main » — envoyé par les gestes manuels qui ne déplacent PAS
  // le ticket (copier le prompt de plan, de vérification, une consigne libre).
  // NO-OP silencieux quand il n'y a rien à annuler : l'appelant tire ce signal à
  // chaque copie, sans savoir s'il existe une chaîne, et un 404 le ferait
  // journaliser une erreur pour un cas parfaitement normal.
  if (action === "handoff") {
    if (chain?.status === "pending") await cancelPendingChain(chain.id, "taken_over");
    return NextResponse.json({ ok: true });
  }

  if (!chain) return NextResponse.json({ error: "No chain on this issue" }, { status: 404 });

  if (action === "stop") {
    // Une chaîne EN SURSIS s'annule en silence : elle n'a rien joué, rien
    // dépensé, et un rapport « la chaîne s'est arrêtée » pour un travail jamais
    // commencé ne ferait qu'encombrer le ticket.
    if (chain.status === "pending") {
      const cancelled = await cancelPendingChain(chain.id, "canceled");
      return NextResponse.json({
        ok: true,
        chain: cancelled ? publicChain(cancelled) : null,
      });
    }
    // Le run en cours part avec elle : le drapeau d'interruption le ramène au
    // repos proprement, sans rien perdre du travail déjà poussé.
    const active = await activeRunForIssue(id);
    if (active) await requestInterrupt(active.id);
    await haltChain(chain, "interrupted");
    const after = await latestChainForIssue(id);
    return NextResponse.json({ ok: true, chain: after ? publicChain(after) : null });
  }

  if (action === "start") {
    // « Lancer maintenant » : on court-circuite le sursis. Le moteur re-vérifie
    // quand même que le ticket est resté où il était — c'est un raccourci, pas
    // un passe-droit.
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

  // resume — feu vert humain, uniquement depuis `awaiting_human`.
  const resumed = await resumeChain(chain.id);
  if (!resumed) {
    return NextResponse.json({ error: "Chain is not waiting for a decision" }, { status: 409 });
  }

  // La suite se rattache au DERNIER run de la chaîne : c'est l'événement que le
  // point d'arrêt avait interrompu, et il n'y a rien d'autre à quoi la rattacher.
  // Pas de run du tout (une règle qui s'arrête avant d'en lancer un) : rien n'a
  // échoué, et le dire déclencherait l'arrêt sur `run_failed` du moteur.
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
