import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getRoutineForUser } from "@/lib/server/routines";
import { runsForRoutine } from "@/lib/server/agent/runs";

/**
 * Les « Exécutions précédentes » d'une routine (MIN-185) — le SEUL endroit où
 * ses runs se lisent. Ils sortent de `/api/agent-runs` : sans ça, une routine
 * quotidienne noierait la colonne des conversations en une semaine.
 *
 * Lecture ouverte aux membres du projet, comme la routine elle-même.
 */

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Colonnes client-safe — jamais le checkpoint ni le sandbox_id. Même forme
    que `AgentRunSummary`, pour que le fil d'events se réutilise tel quel. */
const RUN_FIELDS = [
  "id",
  "project_id",
  "issue_id",
  "pull_request_id",
  "status",
  "model",
  "model_forced",
  "reasoning_level",
  "key_mode",
  "triggered_by",
  "prompt",
  "title",
  "base_branch",
  "branch_name",
  "pr_number",
  "pr_url",
  "pr_state",
  "continuations",
  "cost_usd",
  "outcome",
  "error_message",
  "created_at",
  "updated_at",
  "awaiting_input",
] as const;

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const found = await getRoutineForUser(id, auth.user.id);
  if (!found) return NextResponse.json({ error: "routineNotFound" }, { status: 404 });

  const rows = await runsForRoutine(id);
  const runs = rows.map((run) => {
    const row = run as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const field of RUN_FIELDS) out[field] = row[field] ?? null;
    // Posé par trigger DB, hors du type `AgentRun` — la liste en a besoin pour
    // dire quand un passage s'est terminé.
    out.completed_at = row.completed_at ?? null;
    return out;
  });
  return NextResponse.json({ runs });
}
