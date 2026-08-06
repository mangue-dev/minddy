"use server";

import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { isCustomPublicHost } from "@/lib/server/custom-domains";
import { getBoardByToken } from "@/lib/server/feedback/boards";
import {
  FEEDBACK_SESSION_COOKIE,
  createFeedbackSession,
  feedbackSessionCookieOptions,
  getFeedbackSession,
  revokeFeedbackSession,
  upsertFeedbackUser,
  type FeedbackSessionContext,
} from "@/lib/server/feedback/identity";
import { requestFeedbackOtp, verifyFeedbackOtp } from "@/lib/server/feedback/otp";
import { createFeedbackPost } from "@/lib/server/feedback/posts";
import {
  addPublicComment,
  deletePublicComment,
} from "@/lib/server/feedback/comments";
import { votePost, unvotePost } from "@/lib/server/feedback/votes";
import { embedText, matchFeedbackPosts } from "@/lib/server/embeddings";
import {
  feedbackVoiceEnabled,
  normalizeVoiceDraft,
  normalizeVoiceHistory,
  normalizeVoiceTranscript,
  runFeedbackVoicePass,
} from "@/lib/server/feedback/voice";
import { recordAiUsage, newRunId } from "@/lib/server/ai-usage";
import { ownerHasUsageBudget } from "@/lib/server/usage";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import type { FeedbackVoicePatch, SimilarPost } from "@/lib/feedback/types";

/**
 * Server actions du board public (MIN-37). Le cookie de session est path-scopé
 * /f/<token> : toutes les interactions visiteur passent par ces actions (pas
 * de routes API visiteur). Chaque action re-résout le board par token et
 * revérifie la session — le token seul n'autorise que la lecture.
 */

/** Similarité cosinus minimale pour montrer une suggestion « existe déjà ». */
const MIN_SUGGESTION_SIMILARITY = 0.4;

async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

async function resolveBoard(token: string) {
  const ctx = await getBoardByToken(token);
  if (!ctx || !ctx.board.enabled) return null;
  return ctx;
}

async function resolveSession(
  token: string
): Promise<{ ctx: NonNullable<Awaited<ReturnType<typeof resolveBoard>>>; session: FeedbackSessionContext } | null> {
  const ctx = await resolveBoard(token);
  if (!ctx) return null;
  const cookie = (await cookies()).get(FEEDBACK_SESSION_COOKIE)?.value;
  const session = await getFeedbackSession(ctx.board.id, cookie);
  if (!session) return null;
  return { ctx, session };
}

// ── Authentification OTP ──────────────────────────────────────────────────────

export type OtpRequestState = { ok: true; email: string } | { ok: false; error: "invalidEmail" | "rateLimited" | "sendFailed" } | null;

export async function requestOtpAction(
  token: string,
  email: string
): Promise<OtpRequestState> {
  const ctx = await resolveBoard(token);
  if (!ctx) return { ok: false, error: "sendFailed" };
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@") || trimmed.length < 5) {
    return { ok: false, error: "invalidEmail" };
  }
  const locale = (await getLocale()) === "fr" ? "fr" : "en";
  const result = await requestFeedbackOtp({
    boardId: ctx.board.id,
    email: trimmed,
    projectName: ctx.project.name,
    ip: await clientIp(),
    locale,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, email: trimmed };
}

export type OtpVerifyState =
  | { ok: true }
  | { ok: false; error: "invalidCode" | "expired" | "tooManyAttempts" }
  | null;

export async function verifyOtpAction(
  token: string,
  email: string,
  code: string
): Promise<OtpVerifyState> {
  const ctx = await resolveBoard(token);
  if (!ctx) return { ok: false, error: "invalidCode" };

  const ip = await clientIp();
  const rate = checkSessionRateLimit(ip, `feedback-otp-verify:${ctx.board.id}`, {
    limit: 15,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) return { ok: false, error: "tooManyAttempts" };

  const verified = await verifyFeedbackOtp({ boardId: ctx.board.id, email, code });
  if (!verified.ok) return { ok: false, error: verified.error };

  const user = await upsertFeedbackUser({
    projectId: ctx.project.id,
    email: verified.email,
    verifiedVia: "email",
  });
  if (!user) return { ok: false, error: "invalidCode" };

  const session = await createFeedbackSession({ boardId: ctx.board.id, userId: user.id });
  if (!session) return { ok: false, error: "invalidCode" };
  // Sur domaine personnalisé (MIN-36), le path visible est la racine — le
  // cookie doit y vivre, sinon le navigateur ne le renverra jamais.
  const atRoot = await isCustomPublicHost();
  (await cookies()).set(
    FEEDBACK_SESSION_COOKIE,
    session.token,
    feedbackSessionCookieOptions(token, session.expiresAt, { atRoot })
  );
  revalidatePath(`/f/${token}`, "layout");
  return { ok: true };
}

export async function logoutAction(token: string): Promise<void> {
  const cookie = (await cookies()).get(FEEDBACK_SESSION_COOKIE)?.value;
  await revokeFeedbackSession(cookie);
  // Le path de suppression doit refléter le host courant : le cookie a été
  // posé sur le même site (path "/" sur domaine custom, /f/<token> sinon).
  const atRoot = await isCustomPublicHost();
  (await cookies()).delete({
    name: FEEDBACK_SESSION_COOKIE,
    path: atRoot ? "/" : `/f/${token}`,
  });
  revalidatePath(`/f/${token}`, "layout");
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export type CreatePostState =
  | { ok: true; postId: string }
  | { ok: false; error: "notAuthenticated" | "titleRequired" | "rateLimited" | "failed" }
  | null;

export async function createPostAction(
  token: string,
  input: { title: string; body: string; isPublic?: boolean }
): Promise<CreatePostState> {
  const resolved = await resolveSession(token);
  if (!resolved) return { ok: false, error: "notAuthenticated" };
  const { ctx, session } = resolved;

  const rate = checkSessionRateLimit(session.user.id, "feedback:create-post", { limit: 10 });
  if (!rate.allowed) return { ok: false, error: "rateLimited" };

  const result = await createFeedbackPost({
    projectId: ctx.project.id,
    title: input.title,
    body: input.body,
    source: "board",
    authorId: session.user.id,
    // Coché par défaut côté composeur ; décoché = retour privé pour l'équipe.
    isPublic: input.isPublic ?? true,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.errorKey === "titleRequired" ? "titleRequired" : "failed",
    };
  }
  revalidatePath(`/f/${token}`, "layout");
  return { ok: true, postId: result.post.id };
}

export async function togglePostVoteAction(
  token: string,
  postId: string,
  vote: boolean
): Promise<{ ok: boolean; notAuthenticated?: boolean }> {
  const resolved = await resolveSession(token);
  if (!resolved) return { ok: false, notAuthenticated: true };
  const { session } = resolved;

  const rate = checkSessionRateLimit(session.user.id, "feedback:vote", { limit: 60 });
  if (!rate.allowed) return { ok: false };

  const ok = vote
    ? await votePost({ postId, userId: session.user.id })
    : await unvotePost({ postId, userId: session.user.id });
  if (ok) revalidatePath(`/f/${token}`, "layout");
  return { ok };
}

// ── Commentaires publics (MIN-196) ───────────────────────────────────────────

export type PublicCommentState =
  | { ok: true }
  | { ok: false; error: "notAuthenticated" | "closed" | "rateLimited" | "failed" };

/**
 * Répondre publiquement à un retour. La connexion est obligatoire — non pour
 * afficher qui écrit (le fil est anonyme, seul l'avatar sort), mais pour que
 * l'équipe ait quelqu'un à qui rattacher un propos qu'elle doit pouvoir modérer.
 *
 * `notAuthenticated` rejoue la porte OTP puis le commentaire, exactement comme
 * le vote : quelqu'un qui vient d'écrire trois phrases ne doit pas les perdre
 * parce qu'on lui demande son email à ce moment-là.
 */
export async function addPublicCommentAction(
  token: string,
  postId: string,
  body: string
): Promise<PublicCommentState> {
  const resolved = await resolveSession(token);
  if (!resolved) return { ok: false, error: "notAuthenticated" };
  const { ctx, session } = resolved;

  const rate = checkSessionRateLimit(session.user.id, "feedback:comment", {
    limit: 20,
  });
  if (!rate.allowed) return { ok: false, error: "rateLimited" };

  const result = await addPublicComment({
    projectId: ctx.project.id,
    boardAllowsComments: ctx.board.allow_comments,
    postId,
    feedbackUserId: session.user.id,
    body,
  });
  if (!result.ok) {
    return { ok: false, error: result.error === "closed" ? "closed" : "failed" };
  }
  revalidatePath(`/f/${token}`, "layout");
  return { ok: true };
}

/** Retirer SON commentaire. Le fil est anonyme : personne d'autre ne peut le
    faire depuis le board — l'équipe, elle, modère depuis sa vue. */
export async function deletePublicCommentAction(
  token: string,
  postId: string,
  commentId: string
): Promise<{ ok: boolean }> {
  const resolved = await resolveSession(token);
  if (!resolved) return { ok: false };
  const ok = await deletePublicComment({
    postId,
    commentId,
    feedbackUserId: resolved.session.user.id,
  });
  if (ok) revalidatePath(`/f/${token}`, "layout");
  return { ok };
}

// ── Retour dicté : le rangement par Numo ─────────────────────────────────────

export type DictateFeedbackState =
  | { ok: true; patch: FeedbackVoicePatch; reply: string }
  | { ok: false; error: "notAuthenticated" | "rateLimited" | "unavailable" | "failed" };

/**
 * Deuxième moitié d'une prise : le transcript rendu par `./voice/route.ts`
 * devient un patch du composeur. Une server action suffit ici — c'est du JSON,
 * et le cookie de session voyage avec.
 *
 * `runId` vient de l'étape d'écoute : les deux appels d'une même prise se
 * rangent ainsi sous une seule ligne du ledger. On l'accepte du client parce
 * qu'il n'ouvre rien — c'est une clé de regroupement, revalidée en UUID, et
 * l'imputation ne s'en déduit pas (elle vient du board, comme ici).
 */
export async function dictateFeedbackAction(
  token: string,
  input: { runId?: string; transcript: string; draft: unknown; history: unknown }
): Promise<DictateFeedbackState> {
  const resolved = await resolveSession(token);
  if (!resolved) return { ok: false, error: "notAuthenticated" };
  const { ctx, session } = resolved;

  if (!(await feedbackVoiceEnabled())) return { ok: false, error: "unavailable" };

  const rate = checkSessionRateLimit(session.user.id, "feedback:dictate", {
    limit: 40,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) return { ok: false, error: "rateLimited" };

  if (!(await ownerHasUsageBudget(ctx.project.id))) {
    return { ok: false, error: "unavailable" };
  }

  const transcript = normalizeVoiceTranscript(input.transcript);
  if (!transcript.trim()) return { ok: false, error: "failed" };

  const locale = (await getLocale()) === "fr" ? "fr" : "en";
  try {
    const { patch, reply, usage } = await runFeedbackVoicePass({
      transcript,
      draft: normalizeVoiceDraft(input.draft),
      history: normalizeVoiceHistory(input.history),
      locale,
      projectName: ctx.project.name,
      surface: "board",
      runId: isUuid(input.runId) ? input.runId : newRunId(),
      // 1 quand l'écoute a bien eu lieu : la ligne d'après, dans le même run.
      seq: isUuid(input.runId) ? 1 : 0,
      billTo: { projectOwner: ctx.project.id },
      projectId: ctx.project.id,
    });
    after(() => recordAiUsage(usage));
    return { ok: true, patch, reply };
  } catch (err) {
    console.error("[feedback/dictate] pass failed:", (err as Error).message);
    return { ok: false, error: "failed" };
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

// ── Suggestions live (« ce post existe peut-être déjà ») ─────────────────────

export async function findSimilarPostsAction(
  token: string,
  title: string
): Promise<SimilarPost[]> {
  const ctx = await resolveBoard(token);
  if (!ctx) return [];
  const trimmed = title.trim();
  // ≥ 15 caractères : en dessous, l'embedding du titre seul est du bruit.
  if (trimmed.length < 15) return [];

  const ip = await clientIp();
  const rate = checkSessionRateLimit(ip, `feedback:similar:${ctx.board.id}`, {
    limit: 30,
  });
  if (!rate.allowed) return [];

  // 5 s : le premier appel à froid (config + OpenRouter) peut dépasser 3 s,
  // et un échec ici est silencieux pour le visiteur.
  const embedding = await embedText(trimmed, {
    timeoutMs: 5000,
    // Visiteur du board : aucun déclencheur nommable, le owner paye (MIN-131).
    record: { billTo: { projectOwner: ctx.project.id }, projectId: ctx.project.id },
  });
  if (!embedding) return [];
  const matches = await matchFeedbackPosts({
    projectId: ctx.project.id,
    embedding,
    limit: 5,
    // Un visiteur ne doit jamais se voir suggérer un retour privé d'autrui.
    publicOnly: true,
  });
  return matches
    .filter((m) => m.similarity >= MIN_SUGGESTION_SIMILARITY)
    .map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      voteCount: m.vote_count,
    }));
}
