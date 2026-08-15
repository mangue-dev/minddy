import { NextResponse, after, type NextRequest } from "next/server";
import { getLocale } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { recordAiUsage, newRunId } from "@/lib/server/ai-usage";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { ensureUsageBudget } from "@/lib/server/usage";
import {
  isPlanLimitError,
  planLimitResponse,
} from "@/lib/server/plan-limit-error";
import {
  feedbackVoiceEnabled,
  normalizeVoiceDraft,
  normalizeVoiceHistory,
  normalizeVoiceTranscript,
  runFeedbackVoicePass,
} from "@/lib/server/feedback/voice";

/**
 * Le RANGEMENT d'un retour dicté dans le dashboard — le jumeau authentifié de
 * `dictateFeedbackAction` (board public). Même cœur (`lib/server/feedback/
 * voice.ts`), donc même prompt et mêmes règles ; ce qui change tient en deux
 * lignes : ici le membre qui parle paye, et le projet vient de la session, pas
 * d'un token de board.
 *
 * L'écoute, elle, passe par `/api/transcribe` avec `feature=feedback_voice` :
 * la route rend le `runId` que celle-ci reprend, et les deux appels d'une prise
 * ne font qu'une ligne au ledger.
 *
 * Cette route n'écrit RIEN en base : elle rend un patch, que le modal applique.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 } as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    await ensureUsageBudget(auth.user.id, "feedback");
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  const rateLimit = checkSessionRateLimit(
    auth.user.id,
    "dictate-feedback",
    RATE_LIMIT
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rateLimit.retryAfter },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  if (!(await feedbackVoiceEnabled())) {
    return NextResponse.json({ error: "Dictation not configured" }, { status: 503 });
  }

  let body: {
    transcript?: unknown;
    draft?: unknown;
    history?: unknown;
    runId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const transcript = normalizeVoiceTranscript(body.transcript);
  if (!transcript.trim()) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }

  // RLS porte l'accès : un projet inaccessible se lit comme introuvable.
  const { data: project } = await auth.supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .is("deleted_at", null)
    .single();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const locale = await getLocale();
  const hasRun = isUuid(body.runId);
  try {
    const { patch, reply, usage } = await runFeedbackVoicePass({
      transcript,
      draft: normalizeVoiceDraft(body.draft),
      history: normalizeVoiceHistory(body.history),
      locale,
      projectName: (project as { name: string }).name,
      surface: "internal",
      runId: hasRun ? (body.runId as string) : newRunId(),
      seq: hasRun ? 1 : 0,
      billTo: { userId: auth.user.id },
      projectId,
    });
    after(() => recordAiUsage(usage));
    return NextResponse.json({ patch, reply });
  } catch (err) {
    console.error("[api/dictate-feedback] pass failed:", (err as Error).message);
    return NextResponse.json({ error: "Dictation processing failed" }, { status: 502 });
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
