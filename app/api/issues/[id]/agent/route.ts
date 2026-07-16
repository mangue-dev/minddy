import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { launchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";

/**
 * Runs de l'agent de code d'une issue (MIN-46).
 *  GET  → liste les runs de l'issue (colonnes client-safe).
 *  POST → lance un run { prompt?, model? } (bouton « Lancer un agent »).
 * L'accès à l'issue est vérifié via le cookie client (RLS) ; `launchAgentRun`
 * fait ensuite les pré-checks (dépôt lié, quota/BYOK, run déjà actif).
 */

type RouteContext = { params: Promise<{ id: string }> };

// Le kick de launch draine le premier chunk dans after() : il faut la même
// fenêtre que la route cron (270s de budget) sinon la fonction est tuée en plein
// round et le run reste bloqué en 'running'.
export const runtime = "nodejs";
export const maxDuration = 300;

const RUN_COLUMNS =
  "id, status, model, model_forced, key_mode, triggered_by, prompt, branch_name, pr_number, pr_url, pr_state, continuations, cost_usd, outcome, error_message, created_at, updated_at";

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS : l'appelant doit pouvoir voir l'issue.
  const { data: issue } = await auth.supabase.from("issues").select("id").eq("id", id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select(RUN_COLUMNS)
    .eq("issue_id", id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ runs: data ?? [] });
}

const LAUNCH_ERROR_STATUS: Record<string, number> = {
  issueNotFound: 404,
  noRepo: 409,
  unsupportedProvider: 409,
  alreadyRunning: 409,
  quotaExceeded: 402,
  noModelForProvider: 400,
};

function launchErrorResponse(result: Extract<LaunchResult, { ok: false }>) {
  const status = LAUNCH_ERROR_STATUS[result.error] ?? 400;
  return NextResponse.json(
    { error: result.error, code: result.error, run: result.run, quota: result.quota },
    { status },
  );
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data: issue } = await auth.supabase.from("issues").select("id").eq("id", id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  let body: { prompt?: string; model?: string } = {};
  try {
    body = (await request.json()) as { prompt?: string; model?: string };
  } catch {
    // corps vide accepté
  }
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
  const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : undefined;

  const result = await launchAgentRun({
    issueId: id,
    userId: auth.user.id,
    triggeredBy: "button",
    prompt,
    model,
    forced: !!model,
  });
  if (!result.ok) return launchErrorResponse(result);
  return NextResponse.json({ run: result.run });
}
