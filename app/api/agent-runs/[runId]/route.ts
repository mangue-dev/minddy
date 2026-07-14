import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun, type AgentRun } from "@/lib/server/agent/runs";

/**
 * Détail d'un run d'agent (MIN-46) — colonnes client-safe (jamais le checkpoint
 * ni le sandbox_id). Lecture = membre du projet du run.
 */

type RouteContext = { params: Promise<{ runId: string }> };

function sanitizeRun(run: AgentRun) {
  return {
    id: run.id,
    project_id: run.project_id,
    issue_id: run.issue_id,
    status: run.status,
    model: run.model,
    model_forced: run.model_forced,
    key_mode: run.key_mode,
    triggered_by: run.triggered_by,
    base_branch: run.base_branch,
    branch_name: run.branch_name,
    pr_number: run.pr_number,
    pr_url: run.pr_url,
    pr_state: run.pr_state,
    continuations: run.continuations,
    cost_usd: run.cost_usd,
    outcome: run.outcome,
    error_message: run.error_message,
    created_at: run.created_at,
    updated_at: run.updated_at,
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  return NextResponse.json({ run: sanitizeRun(run) });
}
