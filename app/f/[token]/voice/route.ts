import { NextResponse, after, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { getBoardByToken } from "@/lib/server/feedback/boards";
import {
  FEEDBACK_SESSION_COOKIE,
  getFeedbackSession,
} from "@/lib/server/feedback/identity";
import {
  FEEDBACK_VOICE_MAX_AUDIO_BYTES,
  feedbackVoiceEnabled,
  transcribeFeedbackAudio,
} from "@/lib/server/feedback/voice";
import { recordAiUsage, newRunId } from "@/lib/server/ai-usage";
import { ownerHasUsageBudget } from "@/lib/server/usage";
import { getClientIp } from "@/lib/server/request-ip";
import { consumeFeedbackVoiceLimit } from "@/lib/server/feedback/voice-limits";

/**
 * LISTENING to dictated feedback, on the public board side.
 *
 * The rest of the visitor interactions go through server actions (see
 * `../actions.ts`); this one is a route because it carries audio:
 * the body of a server action is capped at 1 MB, or three minutes of time,
 * and a dictation cut in the middle is not a borderline case, it is the common case.
 *
 * It lives under `/f/<token>/` and not under `/api/` for a cookie reason:
 * visitor session is path-scoped on the board (`/f/<token>`, or `/` on
 * custom domain), and the browser would therefore never send it to `/api/…`.
 *
 * What she does: transcribe, and nothing else. Storage by Numo is the
 * server action `dictateFeedbackAction`, which takes the `runId` rendered here — the
 * two calls from a socket thus share a line at the ledger.
 */

export const runtime = "nodejs";
// A long hold takes longer to reassemble than a short one: same budget as
// /api/transcribe, under which the transcribeAudio timeout falls with margin.
export const maxDuration = 300;

/**
 * Per identified visitor, per hour. The OTP gate is passed before arriving
 * here: this counter limits what ONE person can spend on the board,
 * while the one by IP limits what accounts a machine can open.
 */
const USER_RATE_LIMIT = 20;
const IP_RATE_LIMIT = 40;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const ctx = await getBoardByToken(token);
  if (!ctx || !ctx.board.enabled) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }

  // Identity first: dictating makes the board owner spend, so we know
  // always who spoke. This is also what makes the per person counter
  // possible — without it, only the IP address would remain.
  const cookie = (await cookies()).get(FEEDBACK_SESSION_COOKIE)?.value;
  const session = await getFeedbackSession(ctx.board.id, cookie);
  if (!session) {
    return NextResponse.json({ error: "notAuthenticated" }, { status: 401 });
  }

  if (!(await feedbackVoiceEnabled())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const rate = await consumeFeedbackVoiceLimit({
    boardId: ctx.board.id,
    feedbackUserId: session.user.id,
    operation: "transcribe",
    userLimit: USER_RATE_LIMIT,
    ip: getClientIp(request),
    ipLimit: IP_RATE_LIMIT,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rateLimited", retry_after: rate.retryAfter },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  // The owner pays: without a budget, the microphone stays silent rather than digging.
  if (!(await ownerHasUsageBudget(ctx.project.id, "feedback"))) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  if (audio.size > FEEDBACK_VOICE_MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "tooLarge" }, { status: 413 });
  }

  const runId = newRunId();
  const locale = await getLocale();
  try {
    const { text, usage } = await transcribeFeedbackAudio({
      audio,
      locale,
      runId,
      // Visitor to the board: no nameable trigger on Minddy's side, the owner
      // pays — it was his budget that authorized the appeal (MIN-131).
      billTo: { projectOwner: ctx.project.id },
      projectId: ctx.project.id,
    });
    after(() => recordAiUsage(usage));
    if (!text) return NextResponse.json({ error: "empty" }, { status: 422 });
    return NextResponse.json(
      { runId, text },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[f/voice] transcription failed:", (err as Error).message);
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
}
