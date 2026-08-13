import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { isReasoningLevel } from "@/lib/agent-reasoning";
import { pickIssuePullRequests, type IssuePrRow } from "@/lib/server/agent/activity";
import {
  launchAgentRun,
  type AgentLaunchIntent,
  type LaunchResult,
} from "@/lib/server/agent/launch";
import { parseAgentMentions } from "@/lib/agent-mentions";

/**
 * Runs de l'agent de code d'une issue (MIN-46).
 *  GET  → liste les runs de l'issue (colonnes client-safe) + sa pull request.
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
  "id, status, model, model_forced, reasoning_level, key_mode, triggered_by, prompt, prompt_mentions, pull_request_id, base_branch, branch_name, pr_number, pr_url, pr_state, continuations, cost_usd, outcome, error_message, created_at, updated_at, completed_at, awaiting_input";

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS : l'appelant doit pouvoir voir l'issue.
  const { data: issue } = await auth.supabase.from("issues").select("id").eq("id", id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const service = getServiceClient();
  // La PR du ticket voyage avec les runs : le panneau latéral la lit ici, et non
  // plus sur `agent_runs` (MIN-163). Un ticket peut porter une PR sans qu'aucun
  // run ne l'ait ouverte — PR humaine rattachée par convention, ou rattachée à
  // la main depuis le header de la PR — et le panneau la taisait alors.
  const [{ data }, { data: prs }] = await Promise.all([
    service
      .from("agent_runs")
      .select(RUN_COLUMNS)
      .eq("issue_id", id)
      .order("created_at", { ascending: false }),
    service
      .from("pull_requests")
      .select("id, issue_id, number, state, updated_at")
      .eq("issue_id", id)
      .order("updated_at", { ascending: false }),
  ]);
  const pullRequest =
    pickIssuePullRequests((prs ?? []) as IssuePrRow[])[id] ?? null;
  return NextResponse.json({ runs: data ?? [], pullRequest });
}

// Bornes de longueur (MIN-118) : la consigne est persistée telle quelle dans
// agent_runs ; modèle et branche sont des identifiants courts. Au-delà on tronque.
const MAX_PROMPT_LENGTH = 20_000;
const MAX_MODEL_LENGTH = 200;
const MAX_BRANCH_LENGTH = 255;

const LAUNCH_ERROR_STATUS: Record<string, number> = {
  issueNotFound: 404,
  noRepo: 409,
  unsupportedProvider: 409,
  alreadyRunning: 409,
  quotaExceeded: 402,
  noModelForProvider: 400,
  modelAbovePlan: 403,
};

function launchErrorResponse(result: Extract<LaunchResult, { ok: false }>) {
  const status = LAUNCH_ERROR_STATUS[result.error] ?? 400;
  return NextResponse.json(
    {
      error: result.error,
      code: result.error,
      run: result.run,
      quota: result.quota,
      modelLimit: result.modelLimit,
    },
    { status },
  );
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data: issue } = await auth.supabase.from("issues").select("id").eq("id", id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  type LaunchBody = {
    prompt?: string;
    model?: string;
    baseBranch?: string;
    reasoningLevel?: string;
    intent?: AgentLaunchIntent;
    mentions?: unknown;
  };
  let body: LaunchBody = {};
  try {
    // `null` est du JSON valide : l'affecter ferait un 500 sur `body.model`
    // deux lignes plus bas. Même garde que POST /api/agent-runs (MIN-118).
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as LaunchBody;
  } catch {
    // corps vide accepté
  }
  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim().slice(0, MAX_MODEL_LENGTH)
      : undefined;
  const prompt =
    typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim().slice(0, MAX_PROMPT_LENGTH)
      : undefined;
  const baseBranch =
    typeof body.baseBranch === "string" && body.baseBranch.trim()
      ? body.baseBranch.trim().slice(0, MAX_BRANCH_LENGTH)
      : undefined;
  // Niveau inconnu ignoré : le lancement retombe alors sur le défaut perso.
  const reasoningLevel = isReasoningLevel(body.reasoningLevel) ? body.reasoningLevel : undefined;

  const result = await launchAgentRun({
    issueId: id,
    userId: auth.user.id,
    triggeredBy: "button",
    prompt,
    model,
    forced: !!model,
    baseBranch,
    reasoningLevel,
    // Cadrage (« Générer un plan » / « Vérifier le plan »), contrôle
    // (« Vérifier l'implémentation ») et consigne libre (« Personnalisé ») : le
    // lancement ne déplace pas le ticket. Tout le reste vaut « implémenter ».
    intent:
      body.intent === "plan" || body.intent === "verify" || body.intent === "custom"
        ? body.intent
        : "implement",
    promptMentions: parseAgentMentions(body.mentions),
  });
  if (!result.ok) return launchErrorResponse(result);
  return NextResponse.json({ run: result.run });
}
