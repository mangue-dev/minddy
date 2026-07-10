import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { sha256Hex } from "@/lib/server/oauth/crypto";
import { generatePseudonym } from "@/lib/feedback/pseudonym";

/**
 * Identités et sessions des utilisateurs finaux du board (MIN-37). Jamais
 * d'anonyme : une identité = external_id (SSO/API) et/ou email (OTP), unique
 * par projet. Le pseudonyme public est généré une fois à la création.
 *
 * Sessions en base (pas de cookie signé : pas de secret HMAC générique dans le
 * repo, et la DB donne révocation + observabilité) : cookie httpOnly path-scopé
 * /f/<token> portant un token opaque fbs_, seul le sha256 est persisté.
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

/** Résout ou crée l'identité : par (project, external_id) d'abord, puis par
    (project, email) — un row email-only est upgradé quand le SSO/API apporte
    l'external_id. Les emails sont normalisés en minuscules à l'écriture. */
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
      // Upgrade : l'identité email-only reçoit son external_id (SSO/API).
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

  // Création — id généré côté app pour dériver le pseudonyme avant l'insert.
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

  // Course sur l'unique partiel : quelqu'un a créé la même identité entre nos
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

/** Valide le cookie de session pour CE board. Renouvellement glissant passé la
    demi-vie (fire-and-forget, jamais sur le chemin de la réponse). */
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
    void service
      .from("feedback_sessions")
      .update({
        expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", data.id as string)
      .then(({ error }) => {
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

/** Options du cookie de session, path-scopé au board (une seule et même
    cookie name sert autant de boards que nécessaire). */
export function feedbackSessionCookieOptions(boardToken: string, expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: `/f/${boardToken}`,
    expires: expiresAt,
  };
}
