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
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getClientIp } from "@/lib/server/request-ip";

/**
 * L'ÉCOUTE d'un retour dicté, côté board public.
 *
 * Le reste des interactions visiteur passe par des server actions (voir
 * `../actions.ts`) ; celle-ci est une route parce qu'elle porte de l'audio :
 * le corps d'une server action est plafonné à 1 Mo, soit trois minutes de prise,
 * et une dictée coupée au milieu n'est pas un cas limite, c'est le cas courant.
 *
 * Elle vit sous `/f/<token>/` et non sous `/api/` pour une raison de cookie : la
 * session visiteur est path-scopée sur le board (`/f/<token>`, ou `/` sur
 * domaine personnalisé), et le navigateur ne l'enverrait donc jamais à `/api/…`.
 *
 * Ce qu'elle fait : transcrire, et rien d'autre. Le rangement par Numo est la
 * server action `dictateFeedbackAction`, qui reprend le `runId` rendu ici — les
 * deux appels d'une prise partagent ainsi une ligne au ledger.
 */

export const runtime = "nodejs";
// Une longue prise met plus de temps à remonter qu'une courte : même budget que
// /api/transcribe, sous lequel le timeout de transcribeAudio tombe avec marge.
export const maxDuration = 300;

/**
 * Par visiteur identifié, par heure. La porte OTP est passée avant d'arriver
 * ici : ce compteur borne ce qu'UNE personne peut faire dépenser au board,
 * pendant que celui par IP borne ce qu'une machine peut ouvrir de comptes.
 */
const USER_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 } as const;
const IP_RATE_LIMIT = { limit: 40, windowMs: 60 * 60 * 1000 } as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const ctx = await getBoardByToken(token);
  if (!ctx || !ctx.board.enabled) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }

  // Identité d'abord : dicter fait dépenser le owner du board, alors on sait
  // toujours qui a parlé. C'est aussi ce qui rend le compteur par personne
  // possible — sans elle, il ne resterait que l'IP.
  const cookie = (await cookies()).get(FEEDBACK_SESSION_COOKIE)?.value;
  const session = await getFeedbackSession(ctx.board.id, cookie);
  if (!session) {
    return NextResponse.json({ error: "notAuthenticated" }, { status: 401 });
  }

  if (!(await feedbackVoiceEnabled())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const ipRate = checkSessionRateLimit(
    `ip:${getClientIp(request)}`,
    `feedback-voice:${ctx.board.id}`,
    IP_RATE_LIMIT
  );
  const userRate = checkSessionRateLimit(
    session.user.id,
    "feedback-voice",
    USER_RATE_LIMIT
  );
  if (!ipRate.allowed || !userRate.allowed) {
    const retryAfter = Math.max(ipRate.retryAfter, userRate.retryAfter);
    return NextResponse.json(
      { error: "rateLimited", retry_after: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  // Le owner paye : sans budget, le micro se tait plutôt que de creuser.
  if (!(await ownerHasUsageBudget(ctx.project.id))) {
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
      // Visiteur du board : aucun déclencheur nommable côté minddy, le owner
      // paye — c'est son budget qui a autorisé l'appel (MIN-131).
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
