import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { memberRoleFromRow, projectCapabilities } from "@/lib/project-roles";
import { isValidDataRootKey } from "./encryption/root-key-crypto.mjs";

/**
 * Collaboration tokens (MIN-688): a session's short-lived proof of project
 * access, so a typing batch does not re-run the project access queries.
 *
 * A token is issued after a full access decision (a snapshot, a catch-up, or a
 * batch whose token is missing or due for renewal) and binds the account, the
 * page, its project, the role decision (`canWrite`) and the project's
 * membership generation at that decision. Every batch still authenticates the
 * account live (`getAuthedUser`: session, MFA level, origin) and the database
 * compares the generation inside the commit, so:
 *
 * - removing a member, changing a role or transferring ownership rotates the
 *   generation and refuses the next batch at once (the server then decides
 *   access afresh);
 * - anything that does not rotate it, for example trashing the project, is
 *   honored within the token lifetime, `COLLAB_TOKEN_TTL_MS`.
 *
 * The token carries no secret and no content: it is an HMAC over its claims
 * with a key derived from a server secret, verified locally.
 */

/** How long a token stands in for an access check. */
export const COLLAB_TOKEN_TTL_MS = 45_000;

/** Below this remaining lifetime, a batch re-decides access and renews it. */
export const COLLAB_TOKEN_RENEW_MS = 20_000;

/** Request and response header that carries the token. */
export const COLLAB_TOKEN_HEADER = "x-minddy-collab-token";

const FORMAT = "c1";

export interface CollabGrant {
  userId: string;
  pageId: string;
  projectId: string;
  canWrite: boolean;
  /** The project membership generation the decision was made at. */
  generation: number;
  /** Epoch milliseconds. */
  expiresAt: number;
}

let cachedKey: { source: string; key: Buffer } | null = null;

function signingKey(): Buffer {
  const root = process.env.MINDDY_DATA_ROOT_KEY;
  const source = isValidDataRootKey(root) ? `root:${root}` : process.env.SUPABASE_SERVICE_ROLE_KEY
    ? `service:${process.env.SUPABASE_SERVICE_ROLE_KEY}` : "";
  if (!source) throw new Error("No server secret to sign collaboration tokens");
  if (cachedKey?.source === source) return cachedKey.key;
  const material = source.startsWith("root:")
    ? Buffer.from(source.slice(5), "hex") : Buffer.from(source.slice(8), "utf8");
  try {
    const key = Buffer.from(hkdfSync("sha256", material,
      Buffer.from("minddy:page-collaboration-token:v1"), Buffer.from("signing"), 32));
    cachedKey = { source, key };
    return key;
  } finally {
    material.fill(0);
  }
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(`${FORMAT}.${payload}`).digest("base64url");
}

export function mintCollaborationToken(grant: CollabGrant): string {
  const payload = Buffer.from(JSON.stringify([
    grant.userId, grant.pageId, grant.projectId, grant.canWrite ? 1 : 0,
    grant.generation, grant.expiresAt,
  ])).toString("base64url");
  return `${FORMAT}.${payload}.${sign(payload)}`;
}

/**
 * The grant a token carries, or null when it is malformed, forged, expired,
 * or issued for another account, page or project.
 */
export function verifyCollaborationToken(
  token: string | null | undefined,
  expected: { userId: string; pageId: string; projectId: string },
  now = Date.now()
): CollabGrant | null {
  if (typeof token !== "string" || token.length > 1_024) return null;
  const [format, payload, signature] = token.split(".");
  if (format !== FORMAT || !payload || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
    return null;
  }
  const expectedSignature = sign(payload);
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(claims) || claims.length !== 6) return null;
  const [userId, pageId, projectId, canWrite, generation, expiresAt] = claims;
  if (userId !== expected.userId || pageId !== expected.pageId ||
      projectId !== expected.projectId ||
      !Number.isSafeInteger(generation) || !Number.isSafeInteger(expiresAt) ||
      expiresAt <= now || expiresAt > now + COLLAB_TOKEN_TTL_MS) {
    return null;
  }
  return { userId, pageId, projectId, canWrite: canWrite === 1, generation, expiresAt };
}

/** Whether a valid grant should be renewed by the request that carries it. */
export function grantNeedsRenewal(grant: CollabGrant, now = Date.now()): boolean {
  return grant.expiresAt - now < COLLAB_TOKEN_RENEW_MS;
}

/**
 * A fresh access decision for a collaboration session, with the project's
 * membership generation, from ONE statement (`page_collaboration_grant`).
 * Reading the generation and the membership in separate requests could pair
 * a pre-revocation membership with a post-revocation generation and mint a
 * token that the commit would accept.
 *
 * The decision mirrors `hasProjectAccess`: a live (not trashed) project, its
 * owner or a member, and write access for the owner and the member role.
 * Returns null when the account has no access.
 */
export async function decideCollaborationGrant(
  service: SupabaseClient,
  { userId, pageId, projectId }: { userId: string; pageId: string; projectId: string },
  now = Date.now()
): Promise<CollabGrant | null> {
  const { data, error } = await service.rpc("page_collaboration_grant", {
    p_user_id: userId,
    p_project_id: projectId,
  });
  if (error) throw new Error(`collaboration access read failed: ${error.message}`);
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const generation = Number(row.generation);
  if (!Number.isSafeInteger(generation)) return null;
  const isOwner = row.owner_id === userId;
  if (!isOwner && row.member !== true) return null;
  const capabilities = isOwner
    ? projectCapabilities("owner")
    : projectCapabilities(memberRoleFromRow(row.role), row.can_comment === true);
  return {
    userId,
    pageId,
    projectId,
    canWrite: capabilities.canWrite,
    generation,
    expiresAt: now + COLLAB_TOKEN_TTL_MS,
  };
}
