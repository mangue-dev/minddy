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
 * The STORAGE of a dictated return in the dashboard — the authenticated twin of
 * `dictateFeedbackAction` (public board). Same core (`lib/server/feedback/
 * voice.ts`), so same prompt and same rules; what changes takes two
 * lines: here the member who speaks pays, and the project comes from the session, not
 * of a board token.
 *
 * Listening goes through `/api/transcribe` with `feature=feedback_voice`:
 * the route returns the `runId` which it resumes, and the two calls of a socket
 * make only one line in the ledger.
 *
 * This route does not write ANYTHING in base: it returns a patch, which the modal applies.
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

  // RLS carries access: an inaccessible project reads as not found.
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
