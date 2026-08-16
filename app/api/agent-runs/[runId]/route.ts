import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun, requestInterrupt, type AgentRun } from "@/lib/server/agent/runs";
import { revokeRunKey } from "@/lib/server/agent/run-key";
import { stopSandboxByName } from "@/lib/server/agent/sandbox";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Une conversation de l'agent (MIN-46) : la LIRE, la RENOMMER, l'ÉPINGLER, la
 * DÉSÉPINGLER, la SUPPRIMER.
 *
 * Ces gestes demandent la même chose — pouvoir lire ce run, c'est-à-dire être
 * membre de son projet ET, sauf run partagé, en être le créateur (MIN-332,
 * `canReadAgentRun`) — et rendent le même 404 quand on ne l'a pas : dire
 * « interdit » apprendrait déjà qu'un run porte cet identifiant.
 *
 * La lecture ne rend que des colonnes client-safe (jamais le checkpoint ni le
 * sandbox_id).
 */

type RouteContext = { params: Promise<{ runId: string }> };

function sanitizeRun(run: AgentRun) {
  return {
    id: run.id,
    project_id: run.project_id,
    issue_id: run.issue_id,
    // Ce qui dit à la conversation qu'elle regarde une RELECTURE (MIN-168) : pas
    // de branche à pousser, donc pas de « créer une pull request » à proposer.
    pull_request_id: run.pull_request_id,
    status: run.status,
    model: run.model,
    model_forced: run.model_forced,
    reasoning_level: run.reasoning_level,
    key_mode: run.key_mode,
    triggered_by: run.triggered_by,
    // Bulle « originelle » de la conversation (la note, pour un run carnet).
    prompt: run.prompt,
    prompt_mentions: run.prompt_mentions,
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
    awaiting_input: run.awaiting_input,
    // L'environnement de la conversation (MIN-359), figé au lancement : c'est
    // lui que le chip verrouillé du composer et la note du fil lisent.
    local_exec: run.local_exec,
    local_worktree: run.local_worktree,
    // Stampé par trigger DB (hors du type AgentRun) — parité avec RUN_COLUMNS de
    // /api/issues/[id]/agent pour que le client réutilise AgentRunSummary tel quel.
    completed_at: (run as AgentRun & { completed_at?: string | null }).completed_at ?? null,
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ run: sanitizeRun(run) });
}

/** Un titre de conversation tient sur une ligne — au-delà, la colonne le tronque
 *  de toute façon, et la base n'a pas à porter un paragraphe. */
const MAX_TITLE = 200;

/**
 * RENOMMER la conversation. Le titre est celui que le titreur a écrit au
 * lancement (`agent_runs.title`) : le remplacer à la main, c'est écrire la même
 * colonne, et la cascade d'affichage (`lib/agent-session-title.ts`) le reprend
 * partout — la ligne de la liste, l'en-tête du volet.
 *
 * Un titre VIDE efface le sien : la conversation retombe alors sur le titre de son
 * ticket, ou sur « Conversation sans titre ». C'est le seul moyen de revenir en
 * arrière, et il vaut mieux que d'interdire — un renommage malheureux ne doit pas
 * être définitif.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let payload: { title?: unknown; pinned?: unknown };
  try {
    payload = (await request.json()) as { title?: unknown; pinned?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const hasTitle = Object.prototype.hasOwnProperty.call(payload ?? {}, "title");
  const hasPinned = Object.prototype.hasOwnProperty.call(payload ?? {}, "pinned");
  if (!hasTitle && !hasPinned) {
    return NextResponse.json({ error: "Title or pinned required" }, { status: 400 });
  }
  if (hasPinned && typeof payload.pinned !== "boolean") {
    return NextResponse.json({ error: "Pinned must be a boolean" }, { status: 400 });
  }

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const conversationId = run.conversation_id ?? run.id;
  let title = run.title;
  if (hasTitle) {
    const raw = typeof payload.title === "string" ? payload.title.trim() : "";
    title = raw.slice(0, MAX_TITLE) || null;
    const { error } = await getServiceClient()
      .from("agent_conversations")
      .update({ title })
      .eq("id", conversationId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (hasPinned) {
    const pins = auth.supabase.from("agent_conversation_pins");
    const result = payload.pinned
      ? await pins.upsert(
          { user_id: auth.user.id, conversation_id: conversationId },
          { onConflict: "user_id,conversation_id" },
        )
      : await pins
          .delete()
          .eq("user_id", auth.user.id)
          .eq("conversation_id", conversationId);
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ run: sanitizeRun({ ...run, title }) });
}

/**
 * SUPPRIMER la conversation, quel que soit son état — y compris `running`.
 *
 * C'est délibéré, et c'est même le cas qui a fait écrire cette route : une
 * conversation dont la boucle est morte reste `running`, ne s'arrête pas et ne se
 * guide pas. Refuser de la supprimer parce qu'elle « travaille » laisserait pour
 * seule issue une suppression à la main en base — ce qu'il a fallu faire.
 *
 * TROIS GESTES, ET L'ORDRE COMPTE. On pose le drapeau d'interruption, on coupe la
 * microVM, on révoque la clé du run, PUIS on supprime la ligne. Supprimer d'abord
 * perdrait le nom de la sandbox et le hash de la clé : la microVM tournerait
 * jusqu'au bout de sa session (24 h facturées) et la clé resterait valide, sans
 * plus rien en base pour dire lesquelles. Les trois premiers sont best-effort — un
 * de ces ménages qui échoue ne doit pas empêcher la suppression demandée.
 *
 * La base fait le reste : `agent_run_events` et `agent_run_messages` sont en
 * `on delete cascade`, et rien d'autre ne référence un run.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status === "queued" || run.status === "running") {
    await requestInterrupt(run.id).catch(() => {});
  }
  if (run.sandbox_id) await stopSandboxByName(run.sandbox_id).catch(() => {});
  if (run.provider_key_id) await revokeRunKey(run.provider_key_id).catch(() => {});

  const { error } = await getServiceClient()
    .from("agent_conversations")
    .delete()
    .eq("id", run.conversation_id ?? run.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
