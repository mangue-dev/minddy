import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { findAvatarSeed } from "@/lib/server/avatar-seeds";
import { sha256Hex } from "@/lib/server/oauth/crypto";
import { generatePseudonym } from "@/lib/feedback/pseudonym";
import type { PublicIdentity } from "@/lib/feedback/types";
import { afterOrNow } from "@/lib/server/after-safe";

/**
 * Board end user identities and sessions (MIN-37). Never
 * anonymous: one identity = external_id (SSO/API) and/or email (OTP), unique
 * per project. The public pseudonym is generated once upon creation.
 *
 * Base sessions (no signed cookie: no generic HMAC secret in the
 * repo, and the DB gives revocation + observability): httpOnly path-scoped
 * /f/<token> cookie carrying an opaque token fbs_, only sha256 is persisted.
 */

export const FEEDBACK_SESSION_COOKIE = "mdy_feedback_session";
const SESSION_PREFIX = "fbs_";
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 jours, glissants

export type FeedbackVerifiedVia = "email" | "sso" | "api";

export interface FeedbackUserRow {
  id: string;
  project_id: string;
  external_id: string | null;
  email: string | null;
  name: string | null;
  pseudonym: string;
  verified_via: FeedbackVerifiedVia;
}

const USER_SELECT = "id, project_id, external_id, email, name, pseudonym, verified_via";

export interface UpsertFeedbackUserInput {
  projectId: string;
  externalId?: string | null;
  email?: string | null;
  name?: string | null;
  verifiedVia: FeedbackVerifiedVia;
}

/** Resolves or creates the identity: by (project, external_id) first, then by
 (project, email) — an email-only row is upgraded when the SSO/API brings
 the external_id. Emails are standardized to lowercase when written. */
export async function upsertFeedbackUser(
  input: UpsertFeedbackUserInput
): Promise<FeedbackUserRow | null> {
  const service = getServiceClient();
  const externalId = input.externalId?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  const name = input.name?.trim() || null;
  if (!externalId && !email) return null;

  if (externalId) {
    const { data } = await service
      .from("feedback_users")
      .select(USER_SELECT)
      .eq("project_id", input.projectId)
      .eq("external_id", externalId)
      .maybeSingle();
    if (data) {
      return applyIdentityPatches(data as FeedbackUserRow, { email, name });
    }
  }

  if (email) {
    const { data } = await service
      .from("feedback_users")
      .select(USER_SELECT)
      .eq("project_id", input.projectId)
      .eq("email", email)
      .maybeSingle();
    if (data) {
      const row = data as FeedbackUserRow;
      // Upgrade: the email-only identity receives its external_id (SSO/API).
      const patches: Record<string, unknown> = {};
      if (externalId && !row.external_id) {
        patches.external_id = externalId;
        patches.verified_via = input.verifiedVia;
      }
      if (name && !row.name) patches.name = name;
      if (Object.keys(patches).length === 0) return row;
      const { data: updated } = await service
        .from("feedback_users")
        .update(patches)
        .eq("id", row.id)
        .select(USER_SELECT)
        .maybeSingle();
      return (updated as FeedbackUserRow | null) ?? row;
    }
  }

  // Creation — id generated on the app side to derive the nickname before inserting.
  const id = randomUUID();
  const { data: created, error } = await service
    .from("feedback_users")
    .insert({
      id,
      project_id: input.projectId,
      external_id: externalId,
      email,
      name,
      pseudonym: generatePseudonym(id),
      verified_via: input.verifiedVia,
    })
    .select(USER_SELECT)
    .maybeSingle();
  if (!error) return (created as FeedbackUserRow | null) ?? null;

  // Race on the unique partial: someone created the same identity between our
  // deux lectures — on relit.
  if (error.code === "23505") {
    return upsertFeedbackUserRetry(input.projectId, externalId, email);
  }
  console.error("[feedback-identity] insert failed:", error.message);
  return null;
}

async function applyIdentityPatches(
  row: FeedbackUserRow,
  incoming: { email: string | null; name: string | null }
): Promise<FeedbackUserRow> {
  const service = getServiceClient();
  const patches: Record<string, unknown> = {};
  if (incoming.email && !row.email) patches.email = incoming.email;
  if (incoming.name && !row.name) patches.name = incoming.name;
  if (Object.keys(patches).length === 0) return row;
  const { data } = await service
    .from("feedback_users")
    .update(patches)
    .eq("id", row.id)
    .select(USER_SELECT)
    .maybeSingle();
  return (data as FeedbackUserRow | null) ?? row;
}

async function upsertFeedbackUserRetry(
  projectId: string,
  externalId: string | null,
  email: string | null
): Promise<FeedbackUserRow | null> {
  const service = getServiceClient();
  if (externalId) {
    const { data } = await service
      .from("feedback_users")
      .select(USER_SELECT)
      .eq("project_id", projectId)
      .eq("external_id", externalId)
      .maybeSingle();
    if (data) return data as FeedbackUserRow;
  }
  if (email) {
    const { data } = await service
      .from("feedback_users")
      .select(USER_SELECT)
      .eq("project_id", projectId)
      .eq("email", email)
      .maybeSingle();
    if (data) return data as FeedbackUserRow;
  }
  return null;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface FeedbackSessionContext {
  sessionId: string;
  boardId: string;
  user: FeedbackUserRow;
}

export async function createFeedbackSession(params: {
  boardId: string;
  userId: string;
}): Promise<{ token: string; expiresAt: Date } | null> {
  const service = getServiceClient();
  const token = SESSION_PREFIX + randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { error } = await service.from("feedback_sessions").insert({
    token_hash: sha256Hex(token),
    board_id: params.boardId,
    user_id: params.userId,
    expires_at: expiresAt.toISOString(),
  });
  if (error) {
    console.error("[feedback-identity] session create failed:", error.message);
    return null;
  }
  return { token, expiresAt };
}

/** Validates the session cookie for THIS board. Sliding renewal past the
 half-life (fire-and-forget, never on the way to the answer). */
export async function getFeedbackSession(
  boardId: string,
  token: string | undefined | null
): Promise<FeedbackSessionContext | null> {
  if (!token || !token.startsWith(SESSION_PREFIX)) return null;
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_sessions")
    .select(`id, board_id, expires_at, feedback_users (${USER_SELECT})`)
    .eq("token_hash", sha256Hex(token))
    .maybeSingle();
  if (!data || data.board_id !== boardId) return null;
  if (new Date(data.expires_at as string) <= new Date()) return null;
  const user = data.feedback_users as unknown as FeedbackUserRow | null;
  if (!user) return null;

  const remaining = new Date(data.expires_at as string).getTime() - Date.now();
  if (remaining < SESSION_TTL_MS / 2) {
    // After the response, but attached to the invocation: detached, the slide
    // would die when the lambda freezes and the session would never advance.
    const slid = {
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      last_seen_at: new Date().toISOString(),
    };
    afterOrNow(async () => {
      const { error } = await service
        .from("feedback_sessions")
        .update(slid)
        .eq("id", data.id as string);
      if (error) console.error("[feedback-identity] session slide failed:", error.message);
    });
  }

  return { sessionId: data.id as string, boardId, user };
}

export async function revokeFeedbackSession(token: string | undefined | null): Promise<void> {
  if (!token || !token.startsWith(SESSION_PREFIX)) return;
  const service = getServiceClient();
  await service.from("feedback_sessions").delete().eq("token_hash", sha256Hex(token));
}

/**
 * The identity as the visitor sees himself, at the top of the board.
 *
 * The pseudonym remains the public facade - but the avatar of the header is only seen
 * by its owner (no post displays that of its author), and someone
 * arrived by SSO since minddy expects to find HER face there, not a second
 * drawn at random. The SSO has precisely placed the `auth.users.id` in `external_id`
 * (app/feedback/route.ts): a line `user_avatars` with this name proves the account
 * and gives its seed, and resolving it at each rendering follows a new drawing
 * of avatar without having to propagate anything.
 *
 * Nothing to find — verification by OTP, or board of another product whose
 * `external_id` are not minddy accounts — and the avatar falls back on the
 * pseudonym, anonymous like before.
 */
export async function toPublicIdentity(
  session: FeedbackSessionContext | null
): Promise<PublicIdentity | null> {
  if (!session) return null;
  return {
    pseudonym: session.user.pseudonym,
    email: session.user.email,
    avatarSeed: await findAvatarSeed(getServiceClient(), session.user.external_id),
  };
}

/** Session cookie options, path-scoped to the board (one and the same
 cookie name serves as many boards as necessary). On a custom
 domain (MIN-36), the visible path does not contain /f/<token>:
 atRoot=true sets the cookie at the root — one domain = one board. */
export function feedbackSessionCookieOptions(
  boardToken: string,
  expiresAt: Date,
  opts?: { atRoot?: boolean }
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: opts?.atRoot ? "/" : `/f/${boardToken}`,
    expires: expiresAt,
  };
}
