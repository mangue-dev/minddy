import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import {
  detachDomainFromVercelOnly,
  getDomainForShare,
} from "@/lib/server/custom-domains";
import { getProjectAccess } from "@/lib/server/project-access";
import { sha256Hex } from "@/lib/server/oauth/crypto";
import type { View, ViewShare } from "@/lib/types";

/**
 * Public-link sharing of a saved view (MIN-26). One share per view, opt-in:
 * no row = private. The row holds the URL token (plaintext — it must be
 * re-displayed by the owner dialog) and, for the "password" level, a
 * scrypt(salt) hash of the password.
 *
 * view_shares is RLS deny-all: every read/write goes through the service
 * client, with access enforced HERE like lib/server/views.ts — the actor must
 * access the project, and a personal view (user_id not null) is only its
 * owner's; anything else reads as not found, the same signal RLS gives.
 */

export type ViewShareResult =
  | { ok: true; share: ViewShare | null }
  | {
      ok: false;
      status: number;
      /** Key into the ApiErrors i18n namespace. */
      errorKey:
        | "viewNotFound"
        | "passwordRequired"
        | "globalViewsNotShareable"
        | "databaseError";
    };

export const SHARE_UNLOCK_COOKIE = "mdy_share_unlock";

/** Value of the visitor's unlock cookie for a password share. Deterministic on
    (token, password hash): changing the password or re-creating the share
    invalidates every cookie in the wild without tracking sessions. */
export function unlockCookieValue(token: string, passwordHash: string): string {
  return sha256Hex(`${token}:${passwordHash}`);
}

export function hashSharePassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifySharePassword(
  password: string,
  salt: string,
  hash: string
): boolean {
  const computed = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

/** The share row shape the service client reads (never sent to clients as-is). */
interface ShareRow {
  id: string;
  token: string;
  level: "password" | "public";
  password_salt: string | null;
  password_hash: string | null;
  created_by: string | null;
}

const SHARE_SELECT = "id, token, level, password_salt, password_hash, created_by";

/** Same access rule as updateView: project access, personal view = owner only.
    Global views (project_id null) are not shareable in v1 — the public share
    renderer is single-project. */
async function resolveShareView(
  viewId: string,
  actorId: string
): Promise<
  | { ok: true }
  | { ok: false; status: 400 | 404; errorKey: "viewNotFound" | "globalViewsNotShareable" }
> {
  const service = getServiceClient();
  const { data: view } = await service
    .from("views")
    .select("id, project_id, user_id")
    .eq("id", viewId)
    .maybeSingle();
  if (!view) return { ok: false, status: 404, errorKey: "viewNotFound" };
  if (view.user_id && view.user_id !== actorId) {
    return { ok: false, status: 404, errorKey: "viewNotFound" };
  }
  if (view.project_id === null) {
    return { ok: false, status: 400, errorKey: "globalViewsNotShareable" };
  }
  const access = await getProjectAccess(actorId, view.project_id as string);
  if (!access) return { ok: false, status: 404, errorKey: "viewNotFound" };
  return { ok: true };
}

/**
 * Résolution vue → share pour la gestion du domaine personnalisé (MIN-36).
 * Même règle d'accès que le partage, plus isOwner : attacher un domaine touche
 * l'infra Vercel, la mutation est réservée au owner du projet côté route.
 */
export async function resolveShareForDomain(
  viewId: string,
  actorId: string
): Promise<
  | { ok: true; share: { id: string; token: string } | null; isOwner: boolean }
  | {
      ok: false;
      status: 400 | 404 | 500;
      errorKey: "viewNotFound" | "globalViewsNotShareable" | "databaseError";
    }
> {
  const service = getServiceClient();
  const { data: view } = await service
    .from("views")
    .select("id, project_id, user_id")
    .eq("id", viewId)
    .maybeSingle();
  if (!view) return { ok: false, status: 404, errorKey: "viewNotFound" };
  if (view.user_id && view.user_id !== actorId) {
    return { ok: false, status: 404, errorKey: "viewNotFound" };
  }
  if (view.project_id === null) {
    return { ok: false, status: 400, errorKey: "globalViewsNotShareable" };
  }
  const access = await getProjectAccess(actorId, view.project_id as string);
  if (!access) return { ok: false, status: 404, errorKey: "viewNotFound" };

  const { data: share, error } = await service
    .from("view_shares")
    .select("id, token")
    .eq("view_id", viewId)
    .maybeSingle();
  if (error) {
    console.error("[view-shares] read failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return {
    ok: true,
    share: (share as { id: string; token: string } | null) ?? null,
    isOwner: access.isOwner,
  };
}

export async function getViewShare(
  viewId: string,
  actorId: string
): Promise<ViewShareResult> {
  const resolved = await resolveShareView(viewId, actorId);
  if (!resolved.ok) return resolved;

  const service = getServiceClient();
  const { data, error } = await service
    .from("view_shares")
    .select(SHARE_SELECT)
    .eq("view_id", viewId)
    .maybeSingle();
  if (error) {
    console.error("[view-shares] read failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const row = data as ShareRow | null;
  return { ok: true, share: row ? { level: row.level, token: row.token } : null };
}

export async function upsertViewShare({
  viewId,
  actorId,
  level,
  password,
}: {
  viewId: string;
  actorId: string;
  level: "password" | "public";
  password?: string;
}): Promise<ViewShareResult> {
  const resolved = await resolveShareView(viewId, actorId);
  if (!resolved.ok) return resolved;

  const service = getServiceClient();
  const { data: existingRow, error: readError } = await service
    .from("view_shares")
    .select(SHARE_SELECT)
    .eq("view_id", viewId)
    .maybeSingle();
  if (readError) {
    console.error("[view-shares] read failed:", readError.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const existing = existingRow as ShareRow | null;

  // "password" needs a password only when none is stored yet; providing one
  // always re-hashes (that's the "change password" path).
  let password_salt: string | null = null;
  let password_hash: string | null = null;
  if (level === "password") {
    const trimmed = password?.trim();
    if (trimmed) {
      ({ salt: password_salt, hash: password_hash } = hashSharePassword(trimmed));
    } else if (existing?.password_hash && existing.password_salt) {
      ({ password_salt, password_hash } = existing);
    } else {
      return { ok: false, status: 400, errorKey: "passwordRequired" };
    }
  }

  // Keep the token across password↔public toggles; only a revoke (delete)
  // followed by a re-share mints a new URL.
  const token = existing?.token ?? randomBytes(16).toString("base64url");
  const { error } = existing
    ? await service
        .from("view_shares")
        .update({ level, password_salt, password_hash })
        .eq("id", existing.id)
    : await service.from("view_shares").insert({
        view_id: viewId,
        level,
        token,
        password_salt,
        password_hash,
        created_by: actorId,
      });
  if (error) {
    console.error("[view-shares] upsert failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, share: { level, token } };
}

export async function deleteViewShare(
  viewId: string,
  actorId: string
): Promise<ViewShareResult> {
  const resolved = await resolveShareView(viewId, actorId);
  if (!resolved.ok) return resolved;

  const service = getServiceClient();
  // Le cascade DB emporte l'éventuelle ligne custom_domains mais pas
  // l'attachement Vercel (MIN-36) — capturé avant, détaché après.
  const { data: shareRow } = await service
    .from("view_shares")
    .select("id")
    .eq("view_id", viewId)
    .maybeSingle();
  const domainRow = shareRow ? await getDomainForShare(shareRow.id as string) : null;

  const { error } = await service.from("view_shares").delete().eq("view_id", viewId);
  if (error) {
    console.error("[view-shares] delete failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (domainRow) await detachDomainFromVercelOnly(domainRow);
  return { ok: true, share: null };
}

/** Everything the public /share/[token] page needs to authorize a visitor. */
export interface PublicShareContext {
  share: ShareRow;
  view: View;
  project: { id: string; key: string; name: string; owner_id: string };
}

/** Resolve a share URL token → share + view + live project, or null (→ 404). */
export async function getPublicShareByToken(
  token: string
): Promise<PublicShareContext | null> {
  if (!token) return null;
  const service = getServiceClient();

  const { data: shareRow } = await service
    .from("view_shares")
    .select(`${SHARE_SELECT}, view_id`)
    .eq("token", token)
    .maybeSingle();
  if (!shareRow) return null;

  const { data: view } = await service
    .from("views")
    .select("*")
    .eq("id", shareRow.view_id as string)
    .maybeSingle();
  if (!view) return null;

  const { data: project } = await service
    .from("projects")
    .select("id, key, name, owner_id")
    .eq("id", view.project_id as string)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return null;

  return {
    share: shareRow as ShareRow,
    view: view as View,
    project: project as PublicShareContext["project"],
  };
}
