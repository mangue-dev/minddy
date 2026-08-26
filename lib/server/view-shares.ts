import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import {
  detachDomainFromVercelOnly,
  reserveCustomDomainMutation,
} from "@/lib/server/custom-domains";
import { getProjectAccess } from "@/lib/server/project-access";
import { sha256Hex } from "@/lib/server/oauth/crypto";
import { MIN_SHARE_PASSWORD_LENGTH } from "@/lib/share-password";
import type { PageShare, View, ViewShare } from "@/lib/types";
import type { Page } from "@/lib/pages";

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
 *
 * ── A Wiki PAGE is another target (MIN-283) ──────────────────────
 *
 * The same table, the same `token` column, the same scrypt hash, the same
 * unlocking cookie: a published page only brings its target
 * (`page_id`) and the only setting that only makes sense for her
 * (`include_children`). Tout ce qui touche au SECRET —
 * hash, verify, unlock — is written only once below and
 * serves both; this is the reason for enlargement, and the only thing
 * never duplicate if a third target one day appears.
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
        | "passwordTooShort"
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

/**
 * Does the presented cookie open THIS share? In constant time (MIN-347).
 *
 * The value of the cookie IS the secret that gives access: compare it with `===`
 * stops at the first byte that differs, and this duration is measured. It was the
 * only comparison of repository secrecy which was not in constant time, on
 * an anonymous door that you can question as much as you want.
 *
 * Lengths compared first: `timingSafeEqual` LEVE on two buffers of
 * different sizes, and the expected length is public (64 hex characters).
 */
export function unlockCookieMatches(
  cookie: string | null | undefined,
  token: string,
  passwordHash: string
): boolean {
  if (!cookie) return false;
  const provided = Buffer.from(cookie);
  const expected = Buffer.from(unlockCookieValue(token, passwordHash));
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/** Longueur minimale d'un mot de passe de partage (MIN-347).

    A protected share is an ANONYMOUS door: no one is identified behind it,
    and the only secret is this password. He had none, so “1”
    was an acceptable setting — that is, a share declared as protected
    and open in fact. Eight characters against a salty scrypt, with the counter
    persistent of `share_unlock_attempts` on top: this is what makes the
    balayage en ligne sans objet.

    Value lives in an isomorphic module: the dialogues announce it, this
    function enforces it. */
export { MIN_SHARE_PASSWORD_LENGTH };

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
  /** Target page (MIN-283): the branch leaves with it, or does not leave. */
  include_children: boolean;
}

const SHARE_SELECT =
  "id, token, level, password_salt, password_hash, created_by, include_children";

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
 * Resolution view → share for custom domain management (MIN-36).
 * Same access rule as sharing, plus isOwner: attach a domain key
 * Vercel infrastructure, the transfer is reserved for the owner of the road side project.
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

  // A provided password is prepared outside the transaction because scrypt is
  // deliberately expensive. If it is omitted, the RPC preserves credentials
  // from the row it locks, rather than credentials from a stale application read.
  let password_salt: string | null = null;
  let password_hash: string | null = null;
  if (level === "password") {
    const trimmed = password?.trim();
    if (trimmed) {
      if (trimmed.length < MIN_SHARE_PASSWORD_LENGTH) {
        return { ok: false, status: 400, errorKey: "passwordTooShort" };
      }
      ({ salt: password_salt, hash: password_hash } = hashSharePassword(trimmed));
    }
  }

  const token = randomBytes(16).toString("base64url");
  const { data, error } = await getServiceClient().rpc("upsert_view_share_guarded", {
    p_view_id: viewId,
    p_level: level,
    p_token: token,
    p_password_salt: password_salt,
    p_password_hash: password_hash,
    p_created_by: actorId,
  });
  if (error) {
    console.error("[view-shares] upsert failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const result = data as { status?: unknown; share?: unknown } | null;
  if (result?.status === "password_required") {
    return { ok: false, status: 400, errorKey: "passwordRequired" };
  }
  const row = result?.share as ShareRow | undefined;
  if (result?.status !== "ok" || !row?.token || !row.level) {
    console.error("[view-shares] invalid guarded upsert response");
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, share: { level: row.level, token: row.token } };
}

export async function deleteViewShare(
  viewId: string,
  actorId: string
): Promise<ViewShareResult> {
  const resolved = await resolveShareView(viewId, actorId);
  if (!resolved.ok) return resolved;

  // Use the same durable provider lease as the domain route. A re-created share
  // can commit after this guarded revoke, but it cannot attach its domain until
  // cleanup of the revoked share has finished.
  const reservation = await reserveCustomDomainMutation(`view:${viewId}`, actorId);
  if (reservation) {
    return {
      ok: false,
      status: reservation.error === "provider_unavailable" ? 503 : 409,
      errorKey: "databaseError",
    };
  }

  const { data, error } = await getServiceClient().rpc("revoke_view_share_guarded", {
    p_view_id: viewId,
  });
  if (error) {
    console.error("[view-shares] delete failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const result = data as { status?: unknown; domain?: unknown } | null;
  if (result?.status !== "absent" && result?.status !== "revoked") {
    console.error("[view-shares] invalid guarded revoke response");
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const domainRow = result?.domain as Parameters<typeof detachDomainFromVercelOnly>[0] | null;
  if (domainRow) {
    await detachDomainFromVercelOnly(domainRow, actorId, {
      mutationAlreadyReserved: true,
    });
  }
  return { ok: true, share: null };
}

/** The project, as the two public surfaces call it.

    `icon_url` is one of them: a published page bears the LOGO of the project in its
    header, like the feedback board (MIN-283). On a document sent to
    a customer is the only thing that says who it comes from. */
export interface PublicShareProject {
  id: string;
  key: string;
  name: string;
  owner_id: string;
  icon_url: string | null;
  orb_seed: string | null;
}

/** Everything the public /share/[token] page needs to authorize a visitor. */
export interface PublicShareContext {
  share: ShareRow;
  view: View;
  project: PublicShareProject;
}

/** What /p/[token] needs to know to make a page published (MIN-283). */
export interface PublicPageShareContext {
  share: ShareRow;
  page: Page;
  project: PublicShareProject;
}

/**
 * A sharing token, resolved on ITS target.
 *
 * The token is drawn from the same hat for both, and it is unique in the
 * table: it is therefore here, and nowhere else, that we learn what it is
 * is about. Both public routes call the same function and refuse this
 * which is not for them — a page token opened on `/share/…` is a 404,
 * pas un rendu de travers.
 */
export type PublicShareTarget =
  | ({ kind: "view" } & PublicShareContext)
  | ({ kind: "page" } & PublicPageShareContext);

/** Resolve a share URL token → share + target + live project, or null (→ 404). */
export async function getPublicShareTarget(
  token: string
): Promise<PublicShareTarget | null> {
  if (!token) return null;
  const service = getServiceClient();

  const { data: row } = await service
    .from("view_shares")
    .select(`${SHARE_SELECT}, view_id, page_id`)
    .eq("token", token)
    .maybeSingle();
  if (!row) return null;
  const share = row as ShareRow;

  if (row.page_id) {
    // A page in the CORBEILLE ceases to be public by the second: the link
    // responds 404 without having to unpublish manually. The dividing line,
    // it survives — restoring the page returns the link, with the same token.
    const { data: page } = await service
      .from("pages")
      .select("*")
      .eq("id", row.page_id as string)
      .is("deleted_at", null)
      .maybeSingle();
    if (!page) return null;
    const project = await livePublicProject(page.project_id as string);
    if (!project) return null;
    return { kind: "page", share, page: page as Page, project };
  }

  const { data: view } = await service
    .from("views")
    .select("*")
    .eq("id", row.view_id as string)
    .maybeSingle();
  if (!view) return null;
  const project = await livePublicProject(view.project_id as string);
  if (!project) return null;
  return { kind: "view", share, view: view as View, project };
}

/** Resolve a share URL token → share + view + live project, or null (→ 404).
    A page token makes it `null`: it's not that door. */
export async function getPublicShareByToken(
  token: string
): Promise<PublicShareContext | null> {
  const target = await getPublicShareTarget(token);
  return target?.kind === "view" ? target : null;
}

/** Resolve a share URL token → share + page + live project, or null (→ 404). */
export async function getPublicPageShareByToken(
  token: string
): Promise<PublicPageShareContext | null> {
  const target = await getPublicShareTarget(token);
  return target?.kind === "page" ? target : null;
}

async function livePublicProject(
  projectId: string
): Promise<PublicShareProject | null> {
  const { data } = await getServiceClient()
    .from("projects")
    .select("id, key, name, owner_id, icon_url, orb_seed")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PublicShareProject | null) ?? null;
}

/* ── The PAGE as a target (MIN-283) ──────────────────── ───────────────────── */

export type PageShareResult =
  | { ok: true; share: PageShare | null }
  | {
      ok: false;
      status: number;
      /** Key into the ApiErrors i18n namespace. */
      errorKey:
        | "pageNotFound"
        | "passwordRequired"
        | "passwordTooShort"
        | "databaseError";
    };

/** The dividing line returned to the owner: the link and its settings. */
function toPageShare(row: ShareRow): PageShare {
  return {
    level: row.level,
    token: row.token,
    include_children: row.include_children,
  };
}

/**
 * The page must exist, not be in the trash, and its project must be
 * accessible to the actor. Everything else reads “page not found” — the same
 * signal that RLS would give, and the only one that says nothing about what exists
 * ailleurs.
 */
async function resolveSharePage(
  pageId: string,
  actorId: string
): Promise<{ ok: true; projectId: string } | { ok: false; status: 404; errorKey: "pageNotFound" }> {
  const service = getServiceClient();
  const { data: page } = await service
    .from("pages")
    .select("id, project_id")
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  const access = await getProjectAccess(actorId, page.project_id as string);
  if (!access) return { ok: false, status: 404, errorKey: "pageNotFound" };
  return { ok: true, projectId: page.project_id as string };
}

export async function getPageShare(
  pageId: string,
  actorId: string
): Promise<PageShareResult> {
  const resolved = await resolveSharePage(pageId, actorId);
  if (!resolved.ok) return resolved;

  const { data, error } = await getServiceClient()
    .from("view_shares")
    .select(SHARE_SELECT)
    .eq("page_id", pageId)
    .maybeSingle();
  if (error) {
    console.error("[view-shares] page read failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const row = data as ShareRow | null;
  return { ok: true, share: row ? toPageShare(row) : null };
}

/**
 * Publish a page, or change its publication settings.
 *
 * The token SURVIVES changes in level and settings, like a view:
 * only a depublication (delete) then a republication creates a new
 * URL. A link already sent to a customer should not die because we checked
 * “include subpages”.
 */
export async function upsertPageShare({
  pageId,
  actorId,
  level,
  password,
  includeChildren,
}: {
  pageId: string;
  actorId: string;
  level: "password" | "public";
  password?: string;
  includeChildren?: boolean;
}): Promise<PageShareResult> {
  const resolved = await resolveSharePage(pageId, actorId);
  if (!resolved.ok) return resolved;

  const service = getServiceClient();
  const { data: existingRow, error: readError } = await service
    .from("view_shares")
    .select(SHARE_SELECT)
    .eq("page_id", pageId)
    .maybeSingle();
  if (readError) {
    console.error("[view-shares] page read failed:", readError.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const existing = existingRow as ShareRow | null;

  // Same rule as for a view: “password” only requires a password
  // if there is none yet; providing one changes it.
  let password_salt: string | null = null;
  let password_hash: string | null = null;
  if (level === "password") {
    const trimmed = password?.trim();
    if (trimmed) {
      if (trimmed.length < MIN_SHARE_PASSWORD_LENGTH) {
        return { ok: false, status: 400, errorKey: "passwordTooShort" };
      }
      ({ salt: password_salt, hash: password_hash } = hashSharePassword(trimmed));
    } else if (existing?.password_hash && existing.password_salt) {
      ({ password_salt, password_hash } = existing);
    } else {
      return { ok: false, status: 400, errorKey: "passwordRequired" };
    }
  }

  const include_children = includeChildren ?? existing?.include_children ?? false;
  const token = existing?.token ?? randomBytes(16).toString("base64url");

  const { error } = existing
    ? await service
        .from("view_shares")
        .update({ level, password_salt, password_hash, include_children })
        .eq("id", existing.id)
    : await service.from("view_shares").insert({
        page_id: pageId,
        level,
        token,
        password_salt,
        password_hash,
        include_children,
        created_by: actorId,
      });
  if (error) {
    console.error("[view-shares] page upsert failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, share: { level, token, include_children } };
}

/** Stop posting: The link stops responding, immediately. */
export async function deletePageShare(
  pageId: string,
  actorId: string
): Promise<PageShareResult> {
  const resolved = await resolveSharePage(pageId, actorId);
  if (!resolved.ok) return resolved;

  const { error } = await getServiceClient()
    .from("view_shares")
    .delete()
    .eq("page_id", pageId);
  if (error) {
    console.error("[view-shares] page delete failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, share: null };
}
