import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { SESSION_COOKIE_OPTIONS } from "@/lib/session-cookies";
import { getServiceClient } from "@/lib/supabase-service";
import { findAvatarSeed } from "@/lib/server/avatar-seeds";
import { sha256Hex } from "@/lib/server/oauth/crypto";
import { generatePseudonym } from "@/lib/feedback/pseudonym";
import type { PublicIdentity } from "@/lib/feedback/types";
import { afterOrNow } from "@/lib/server/after-safe";
import { decodeFeedbackIdentityRow, encodeFeedbackIdentity,
  feedbackIdentityLookup, shouldProtectFeedbackIdentity } from "./identity-content";

/**
 * Board participant identities and sessions (MIN-37). An identity has an
 * external ID (SSO/API), an email (OTP), or both, and is unique per project.
 * The public pseudonym is generated once when the identity is created.
 *
 * Database sessions allow revocation and inspection. The path scoped HTTP-only
 * cookie carries an opaque token; only its SHA-256 hash is stored.
 */

export const FEEDBACK_SESSION_COOKIE = "mdy_feedback_session";
const SESSION_PREFIX = "fbs_";
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // Sliding 90-day expiry.

export type FeedbackVerifiedVia = "email" | "sso" | "api";

export interface FeedbackUserRow {
  id: string;
  project_id: string;
  external_id: string | null;
  email: string | null;
  name: string | null;
  pseudonym: string;
  verified_via: FeedbackVerifiedVia;
  erased_at?: string | null;
}

const USER_SELECT = "id, project_id, external_id, email, name, pseudonym, verified_via, erased_at";

async function findFeedbackUser(projectId: string,
  column: "external_id" | "email", value: string,
  protect: boolean): Promise<FeedbackUserRow | null> {
  const service = getServiceClient();
  if (protect) {
    const digest = await feedbackIdentityLookup(projectId, column, value);
    const { data, error } = await service.from("feedback_users")
      .select(USER_SELECT).eq("project_id", projectId)
      .eq(`${column}_lookup`, digest).maybeSingle();
    if (error) throw new Error("Unable to resolve feedback identity");
    if (data?.erased_at) return null;
    if (data) return decodeFeedbackIdentityRow(data as FeedbackUserRow,
      projectId);
  }
  const { data, error } = await service.from("feedback_users")
    .select(USER_SELECT).eq("project_id", projectId).eq(column, value)
    .maybeSingle();
  if (error) throw new Error("Unable to resolve legacy feedback identity");
  return data && !data.erased_at
    ? decodeFeedbackIdentityRow(data as FeedbackUserRow, projectId) : null;
}

async function protectedFields(projectId: string, id: string,
  fields: { external_id?: string | null; email?: string | null;
    name?: string | null }, protect: boolean): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = { ...fields };
  if (!protect) return result;
  for (const column of ["external_id", "email", "name"] as const) {
    const value = fields[column];
    if (typeof value !== "string") continue;
    result[column] = await encodeFeedbackIdentity(projectId, id, column, value);
    if (column !== "name") {
      result[`${column}_lookup`] = await feedbackIdentityLookup(
        projectId, column, value);
    }
  }
  return result;
}

export interface UpsertFeedbackUserInput {
  projectId: string;
  externalId?: string | null;
  email?: string | null;
  name?: string | null;
  verifiedVia: FeedbackVerifiedVia;
}

/** Resolve or create by external ID, then email. SSO/API can add an external ID
 * to an existing email identity. Emails are normalized to lowercase. */
export async function upsertFeedbackUser(
  input: UpsertFeedbackUserInput
): Promise<FeedbackUserRow | null> {
  const service = getServiceClient();
  const externalId = input.externalId?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  const name = input.name?.trim() || null;
  if (!externalId && !email) return null;
  const protect = await shouldProtectFeedbackIdentity(service);

  if (externalId) {
    const row = await findFeedbackUser(input.projectId, "external_id",
      externalId, protect);
    if (row) {
      return applyIdentityPatches(row, { email, name }, protect);
    }
  }

  if (email) {
    const row = await findFeedbackUser(input.projectId, "email", email,
      protect);
    if (row) {
      // Add the external ID when an email identity later uses SSO or API auth.
      const patches: Record<string, unknown> = {};
      if (externalId && !row.external_id) {
        Object.assign(patches, await protectedFields(input.projectId,
          row.id, { external_id: externalId }, protect));
        patches.verified_via = input.verifiedVia;
      }
      if (name && !row.name) Object.assign(patches, await protectedFields(
        input.projectId, row.id, { name }, protect));
      if (Object.keys(patches).length === 0) return row;
      const { data: updated } = await service
        .from("feedback_users")
        .update(patches)
        .eq("id", row.id)
        .is("erased_at", null)
        .select(USER_SELECT)
        .maybeSingle();
      return updated ? decodeFeedbackIdentityRow(updated as FeedbackUserRow,
        input.projectId) : null;
    }
  }

  // Generate the ID here so the pseudonym is ready for the insert.
  const id = randomUUID();
  const { data: created, error } = await service
    .from("feedback_users")
    .insert({
      id,
      project_id: input.projectId,
      ...(await protectedFields(input.projectId, id,
        { external_id: externalId, email, name }, protect)),
      pseudonym: generatePseudonym(id),
      verified_via: input.verifiedVia,
    })
    .select(USER_SELECT)
    .maybeSingle();
  if (!error) return created ? decodeFeedbackIdentityRow(
    created as FeedbackUserRow, input.projectId) : null;

  // A concurrent insert may win the unique lookup; read that identity again.
  if (error.code === "23505") {
    return upsertFeedbackUserRetry(input.projectId, externalId, email, protect);
  }
  console.error("[feedback-identity] insert failed");
  return null;
}

async function applyIdentityPatches(
  row: FeedbackUserRow,
  incoming: { email: string | null; name: string | null },
  protect: boolean,
): Promise<FeedbackUserRow | null> {
  const service = getServiceClient();
  const patches: Record<string, unknown> = {};
  if (incoming.email && !row.email) Object.assign(patches,
    await protectedFields(row.project_id, row.id,
      { email: incoming.email }, protect));
  if (incoming.name && !row.name) Object.assign(patches,
    await protectedFields(row.project_id, row.id,
      { name: incoming.name }, protect));
  if (Object.keys(patches).length === 0) return row;
  const { data } = await service
    .from("feedback_users")
    .update(patches)
    .eq("id", row.id)
    .is("erased_at", null)
    .select(USER_SELECT)
    .maybeSingle();
  return data ? decodeFeedbackIdentityRow(data as FeedbackUserRow,
    row.project_id) : null;
}

async function upsertFeedbackUserRetry(
  projectId: string,
  externalId: string | null,
  email: string | null,
  protect: boolean,
): Promise<FeedbackUserRow | null> {
  if (externalId) {
    const row = await findFeedbackUser(projectId, "external_id", externalId,
      protect);
    if (row) return row;
  }
  if (email) {
    const row = await findFeedbackUser(projectId, "email", email, protect);
    if (row) return row;
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
    console.error("[feedback-identity] session create failed");
    return null;
  }
  return { token, expiresAt };
}

/** Validate this board's session. Renew it after half its lifetime. */
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
  const storedUser = data.feedback_users as unknown as FeedbackUserRow | null;
  if (storedUser?.erased_at) return null;
  const user = storedUser ? await decodeFeedbackIdentityRow(storedUser,
    storedUser.project_id) : null;
  if (!user) return null;

  const remaining = new Date(data.expires_at as string).getTime() - Date.now();
  if (remaining < SESSION_TTL_MS / 2) {
    // Keep the renewal attached to the invocation so it survives response send.
    const slid = {
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      last_seen_at: new Date().toISOString(),
    };
    afterOrNow(async () => {
      const { error } = await service
        .from("feedback_sessions")
        .update(slid)
        .eq("id", data.id as string);
      if (error) console.error("[feedback-identity] session slide failed");
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
 * The identity shown to the participant at the top of the board.
 *
 * The pseudonym stays public. The private header may show the owner's avatar
 * when SSO stored an `auth.users.id` as the external ID and an avatar exists.
 *
 * OTP users and external products without a matching account use the
 * pseudonym avatar.
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

/** Scope the cookie to its board path. */
export function feedbackSessionCookieOptions(
  boardToken: string,
  expiresAt: Date
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: SESSION_COOKIE_OPTIONS.secure,
    path: `/f/${boardToken}`,
    expires: expiresAt,
  };
}
