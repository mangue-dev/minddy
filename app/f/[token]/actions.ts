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
import { clientIpFromHeaders } from "@/lib/server/request-ip";
import type { FeedbackVoicePatch, SimilarPost } from "@/lib/feedback/types";

/**
 * Server actions of the public board (MIN-37). Session cookie is path-scoped
 * /f/<token>: all visitor interactions go through these actions (not
 * of visitor API routes). Each action re-solves the board by token and
 * rechecks the session — the token alone only authorizes reading.
 */

/** Minimum cosine similarity to show an “already exists” suggestion. */
const MIN_SUGGESTION_SIMILARITY = 0.4;

async function clientIp(): Promise<string> {
  return clientIpFromHeaders(await headers());
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

export type OtpRequestState =
  | { ok: true; email: string }
  | { ok: false; error: "invalidEmail" | "rateLimited" | "sendFailed" | "notConfigured" }
  | null;

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
  // On custom domain (MIN-36), the visible path is the root — the
  // cookie must live there, otherwise the browser will never return it.
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
  // The deletion path must reflect the current host: the cookie was
  // placed on the same site (path "/" on custom domain, /f/<token> otherwise).
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
    // Checked by default on the composer side; unchecked = private return for the team.
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
  const { ctx, session } = resolved;

  const rate = checkSessionRateLimit(session.user.id, "feedback:vote", { limit: 60 });
  if (!rate.allowed) return { ok: false };

  const ok = vote
    ? // The post resolves IN the board project (MIN-342): the id comes from
      // customer, and without this safeguard it means any return.
      await votePost({ postId, userId: session.user.id, projectId: ctx.project.id })
    : await unvotePost({ postId, userId: session.user.id });
  if (ok) revalidatePath(`/f/${token}`, "layout");
  return { ok };
}

// ── Commentaires publics (MIN-196) ───────────────────────────────────────────

export type PublicCommentState =
  | { ok: true }
  | { ok: false; error: "notAuthenticated" | "closed" | "rateLimited" | "failed" };

/**
 * Respond publicly to feedback. Login is required — not for
 * display who is writing (the thread is anonymous, only the avatar comes out), but so that
 * the team has someone to relate to a statement that it must be able to moderate.
 *
 * `notAuthenticated` replays the OTP gate then the comment, exactly like
 * voting: someone who has just written three sentences must not lose them
 * because he is asked for his email at that moment.
 */
export async function addPublicCommentAction(
  token: string,
  postId: string,
  body: string,
  /** The message to which we respond (stored under the root of its thread). */
  parentId: string | null = null
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
    parentId,
  });
  if (!result.ok) {
    return { ok: false, error: result.error === "closed" ? "closed" : "failed" };
  }
  revalidatePath(`/f/${token}`, "layout");
  return { ok: true };
}

/** Remove HIS comment. The thread is anonymous: no one else can
 from the board — the team moderates from its view. */
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

// ── Return dictated: storage by Numo ─────────────────────────────────────

export type DictateFeedbackState =
  | { ok: true; patch: FeedbackVoicePatch; reply: string }
  | { ok: false; error: "notAuthenticated" | "rateLimited" | "unavailable" | "failed" };

/**
 * Second half of a take: the transcript rendered by `./voice/route.ts`
 * becomes a composer patch. A server action is enough here — it's JSON,
 * and the session cookie travels with it.
 *
 * `runId` comes from the listening stage: the two calls from the same socket are
 * thus stored under a single line of the ledger. We accept it from the customer because
 * that it doesn't open anything — it's a grouping key, revalidated to UUID, and
 * the imputation is not deduced from it (it comes from the board, like here).
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

  if (!(await ownerHasUsageBudget(ctx.project.id, "feedback"))) {
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
      // 1 when listening has taken place: the next line, in the same run.
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

// ── Live suggestions (“this post may already exist”) ─────────────────────

/**
 * The call is CHARGED to the board owner (MIN-131), so it requires a
 * visitor identity (MIN-342): without it, an anonymous person emptied the AI ​​budget of
 * someone else typing. The composer opened by a visitor
 * identified simply has no suggestions — the OTP gate is coming all the way
 * way to sending, and an empty array is already the nominal case here.
 *
 * The quota comes with: the ceiling per identity, and the owner's budget,
 * like the dictation just above.
 */
export async function findSimilarPostsAction(
  token: string,
  title: string
): Promise<SimilarPost[]> {
  const resolved = await resolveSession(token);
  if (!resolved) return [];
  const { ctx, session } = resolved;
  const trimmed = title.trim();
  // ≥ 15 characters: below, the embedding of the title alone is noise.
  if (trimmed.length < 15) return [];

  const rate = checkSessionRateLimit(session.user.id, "feedback:similar", {
    limit: 30,
  });
  if (!rate.allowed) return [];

  if (!(await ownerHasUsageBudget(ctx.project.id, "feedback"))) return [];

  // 5 s: the first cold call (config + OpenRouter) can exceed 3 s,
  // and failure here is silent to the visitor.
  const embedding = await embedText(trimmed, {
    timeoutMs: 5000,
    // Visitor to the board: no nameable trigger, the owner pays (MIN-131).
    record: { billTo: { projectOwner: ctx.project.id }, projectId: ctx.project.id },
  });
  if (!embedding) return [];
  const matches = await matchFeedbackPosts({
    projectId: ctx.project.id,
    embedding,
    limit: 5,
    // A visitor should never be suggested private feedback from another.
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
