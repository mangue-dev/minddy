import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import {
  detachDomainFromVercelOnly,
  getDomainForShare,
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
 * ── Une PAGE du wiki est une cible de plus (MIN-283) ──────────────────────
 *
 * La même table, la même colonne `token`, le même hachage scrypt, le même
 * cookie de déverrouillage : une page publiée n'apporte que sa cible
 * (`page_id`) et le seul réglage qui n'ait de sens que pour elle
 * (`include_children`). Tout ce qui touche au SECRET —
 * hacher, vérifier, déverrouiller — est écrit une seule fois ci-dessous et
 * sert aux deux ; c'est la raison d'être de l'élargissement, et la seule chose
 * à ne jamais dupliquer si une troisième cible apparaît un jour.
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
 * Le cookie présenté ouvre-t-il CE partage ? En temps constant (MIN-347).
 *
 * La valeur du cookie EST le secret qui donne accès : la comparer avec `===`
 * s'arrête au premier octet qui diffère, et cette durée-là se mesure. C'était la
 * seule comparaison de secret du dépôt qui n'était pas en temps constant, sur
 * une porte anonyme qu'on peut interroger autant qu'on veut.
 *
 * Longueurs comparées d'abord : `timingSafeEqual` LÈVE sur deux tampons de
 * tailles différentes, et la longueur attendue est publique (64 caractères hex).
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

    Un partage protégé est une porte ANONYME : personne n'est identifié derrière,
    et le seul secret est ce mot de passe-là. Il n'en avait aucune, donc « 1 »
    était un réglage acceptable — c'est-à-dire un partage annoncé comme protégé
    et ouvert de fait. Huit caractères contre un scrypt salé, avec le compteur
    persistant de `share_unlock_attempts` par-dessus : c'est ce qui rend le
    balayage en ligne sans objet.

    La valeur vit dans un module isomorphe : les dialogues l'annoncent, cette
    fonction la fait respecter. */
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
  /** Cible page (MIN-283) : la branche part avec elle, ou ne part pas. */
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

/** Le projet, tel que les deux surfaces publiques le nomment.

    `icon_url` en fait partie : une page publiée porte le LOGO du projet dans son
    en-tête, comme le board de retours (MIN-283). Sur un document qu'on envoie à
    un client, c'est la seule chose qui dise de qui il vient. */
export interface PublicShareProject {
  id: string;
  key: string;
  name: string;
  owner_id: string;
  icon_url: string | null;
}

/** Everything the public /share/[token] page needs to authorize a visitor. */
export interface PublicShareContext {
  share: ShareRow;
  view: View;
  project: PublicShareProject;
}

/** Ce que /p/[token] a besoin de savoir pour rendre une page publiée (MIN-283). */
export interface PublicPageShareContext {
  share: ShareRow;
  page: Page;
  project: PublicShareProject;
}

/**
 * Un token de partage, résolu sur SA cible.
 *
 * Le token est tiré du même chapeau pour les deux, et il est unique dans la
 * table : c'est donc ici, et nulle part ailleurs, qu'on apprend de quoi il
 * s'agit. Les deux routes publiques appellent la même fonction et refusent ce
 * qui n'est pas pour elles — un token de page ouvert sur `/share/…` est un 404,
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
    // Une page à la CORBEILLE cesse d'être publique à la seconde : le lien
    // répond 404 sans qu'on ait à dépublier à la main. La ligne de partage,
    // elle, survit — restaurer la page rend le lien, avec le même token.
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
    Un token de page en rend `null` : ce n'est pas cette porte-là. */
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
    .select("id, key, name, owner_id, icon_url")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PublicShareProject | null) ?? null;
}

/* ── La PAGE comme cible (MIN-283) ───────────────────────────────────────── */

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

/** La ligne de partage rendue au propriétaire : le lien et ses réglages. */
function toPageShare(row: ShareRow): PageShare {
  return {
    level: row.level,
    token: row.token,
    include_children: row.include_children,
  };
}

/**
 * La page doit exister, ne pas être à la corbeille, et son projet être
 * accessible à l'acteur. Tout le reste se lit « page introuvable » — le même
 * signal que donnerait RLS, et le seul qui ne dise rien de ce qui existe
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
 * Publier une page, ou changer les réglages de sa publication.
 *
 * Le token SURVIT aux changements de niveau et de réglages, comme pour une vue :
 * seule une dépublication (delete) puis une republication forge une nouvelle
 * URL. Un lien déjà envoyé à un client ne doit pas mourir parce qu'on a coché
 * « inclure les sous-pages ».
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

  // Même règle que pour une vue : « password » n'exige un mot de passe que
  // s'il n'y en a pas encore ; en fournir un le change.
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

/** Cesser de publier : le lien cesse de répondre, immédiatement. */
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
