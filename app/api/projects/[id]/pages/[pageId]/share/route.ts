import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  deletePageShare,
  getPageShare,
  upsertPageShare,
} from "@/lib/server/view-shares";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * PUBLICATION of a page (MIN-283) — one more target for sharing
 * public of MIN-26, therefore the same route form as `/api/views/[id]/share`:
 * GET status, PUT publish or re-set, DELETE unpublish.
 *
 * The `projectId` of the URL is not reread here: access is controlled on the
 * PAGE project (lib/server/view-shares.ts), which is the only truth —
 * accepting a project id in the path and relying on it would open exactly the
 * hole that the verification by the page closes.
 */

// Password terminal, aligned with the view sharing route (MIN-118):
// scrypt hashes what it is given, and refusal is better than truncation
// silent — a truncated password would never unlock anything.
const MAX_PASSWORD_LENGTH = 256;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await getPageShare(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ share: result.share });
}

/**
 * PUT — publish (or re-set): { level, password?, include_children? }.
 *
 * No indexing settings: a published page always has `noindex`. THE
 * link IS the secret (see the `page_shares_no_indexing` migration).
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const { level, password, include_children } = (body ?? {}) as {
    level?: unknown;
    password?: unknown;
    include_children?: unknown;
  };
  if (level !== "password" && level !== "public") {
    return NextResponse.json({ error: t("invalidShareLevel") }, { status: 400 });
  }
  if (typeof password === "string" && password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  if (include_children !== undefined && typeof include_children !== "boolean") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const result = await upsertPageShare({
    pageId,
    actorId: auth.user.id,
    level,
    password: typeof password === "string" ? password : undefined,
    includeChildren: include_children as boolean | undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ share: result.share });
}

/** DELETE — stop posting: The link stops responding immediately. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await deletePageShare(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
