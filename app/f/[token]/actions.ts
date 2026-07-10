"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
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
import { votePost, unvotePost, voteFacet, unvoteFacet } from "@/lib/server/feedback/votes";
import { addUserFacet } from "@/lib/server/feedback/facets";
import { countLiveFacets } from "@/lib/server/feedback/queries";
import { embedText, matchFeedbackPosts, matchFeedbackFacets } from "@/lib/server/embeddings";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import type { SimilarPost } from "@/lib/feedback/types";

/**
 * Server actions du board public (MIN-37). Le cookie de session est path-scopé
 * /f/<token> : toutes les interactions visiteur passent par ces actions (pas
 * de routes API visiteur). Chaque action re-résout le board par token et
 * revérifie la session — le token seul n'autorise que la lecture.
 */

/** Seuil au-delà duquel le composeur de facette fait un check de similarité
    (en dessous, la liste est scannable à l'œil). */
const FACET_SIMILARITY_THRESHOLD_COUNT = 15;
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
  (await cookies()).set(
    FEEDBACK_SESSION_COOKIE,
    session.token,
    feedbackSessionCookieOptions(token, session.expiresAt)
  );
  revalidatePath(`/f/${token}`, "layout");
  return { ok: true };
}

export async function logoutAction(token: string): Promise<void> {
  const cookie = (await cookies()).get(FEEDBACK_SESSION_COOKIE)?.value;
  await revokeFeedbackSession(cookie);
  (await cookies()).delete({
    name: FEEDBACK_SESSION_COOKIE,
    path: `/f/${token}`,
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
  input: { title: string; body: string }
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

export async function toggleFacetVoteAction(
  token: string,
  facetId: string,
  vote: boolean
): Promise<{ ok: boolean; notAuthenticated?: boolean }> {
  const resolved = await resolveSession(token);
  if (!resolved) return { ok: false, notAuthenticated: true };
  const { session } = resolved;

  const rate = checkSessionRateLimit(session.user.id, "feedback:vote", { limit: 60 });
  if (!rate.allowed) return { ok: false };

  const ok = vote
    ? await voteFacet({ facetId, userId: session.user.id })
    : await unvoteFacet({ facetId, userId: session.user.id });
  if (ok) revalidatePath(`/f/${token}`, "layout");
  return { ok };
}

export type AddFacetState =
  | { ok: true }
  | { ok: false; error: "notAuthenticated" | "titleRequired" | "rateLimited" | "failed" }
  | null;

export async function addFacetAction(
  token: string,
  postId: string,
  text: string
): Promise<AddFacetState> {
  const resolved = await resolveSession(token);
  if (!resolved) return { ok: false, error: "notAuthenticated" };
  const { session } = resolved;

  const rate = checkSessionRateLimit(session.user.id, "feedback:add-facet", { limit: 20 });
  if (!rate.allowed) return { ok: false, error: "rateLimited" };

  const result = await addUserFacet({ postId, userId: session.user.id, text });
  if (!result.ok) {
    return {
      ok: false,
      error: result.errorKey === "titleRequired" ? "titleRequired" : "failed",
    };
  }
  revalidatePath(`/f/${token}`, "layout");
  return { ok: true };
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
  const embedding = await embedText(trimmed, { timeoutMs: 5000 });
  if (!embedding) return [];
  const matches = await matchFeedbackPosts({
    projectId: ctx.project.id,
    embedding,
    limit: 5,
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

export async function findSimilarFacetsAction(
  token: string,
  postId: string,
  text: string
): Promise<string[]> {
  const ctx = await resolveBoard(token);
  if (!ctx) return [];
  const trimmed = text.trim();
  if (trimmed.length < 15) return [];

  // Check de similarité seulement à partir de ~15 facettes existantes.
  const count = await countLiveFacets(postId);
  if (count < FACET_SIMILARITY_THRESHOLD_COUNT) return [];

  const ip = await clientIp();
  const rate = checkSessionRateLimit(ip, `feedback:similar:${ctx.board.id}`, {
    limit: 30,
  });
  if (!rate.allowed) return [];

  const embedding = await embedText(trimmed, { timeoutMs: 3000 });
  if (!embedding) return [];
  const matches = await matchFeedbackFacets({ postId, embedding, limit: 3 });
  return matches
    .filter((m) => m.similarity >= MIN_SUGGESTION_SIMILARITY)
    .map((m) => m.facet_text);
}
