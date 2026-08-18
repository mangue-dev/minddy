import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { discardPage, getPage, trashPage, updatePage } from "@/lib/server/pages";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/** GET — a page with its body (ProseMirror document). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await getPage(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.page);
}

/**
 * PATCH — title, icon, parent, position, body.
 *
 * A `parent_id` which would put the page under one of its own descendants responds
 * **409** and writes NOTHING: the depth is unlimited, so the only thing that
 * prevents the sidebar from going into infinite recursion is this refusal.
 *
 * A body sent with an EXPIRED `version` also responds 409, and for
 * same basic reason: never write over what you have not read. There
 * difference is in the response — this one has `conflict: true` and the page
 * of the server, including the body, so that the client merges by block
 * (`lib/pages-merge.ts`) without another round trip.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
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

  const result = await updatePage({
    pageId,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    if (result.conflict) {
      return NextResponse.json(
        { error: t(result.errorKey), conflict: true, page: result.conflict },
        { status: result.status }
      );
    }
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.page);
}

/**
 * DELETE — recycle bin, RECURSIVE (the page and its descendants).
 *
 * Nothing is destroyed: the line is marked, output readings for 30 days,
 * and returns as is by `POST .../restore` or from the trash. It is
 * which makes it acceptable to remove the subpage block in the parent's body
 * (MIN-272) deletes the page — the gesture is recoverable.
 *
 * `?discard=1` is the EXCEPTION, and the only one: a page created then left without
 * that a letter is written there is destroyed for good, rather than going
 * cluttering up the trash with a document that no one wanted. The server
 * double-check that it is empty and without a subpage (`discardPage`): this is
 * this guard, and not the good faith of the client, which makes the path safe.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  if (request.nextUrl.searchParams.get("discard") === "1") {
    const discarded = await discardPage(pageId, auth.user.id);
    if (!discarded.ok) {
      return NextResponse.json(
        { error: t(discarded.errorKey) },
        { status: discarded.status }
      );
    }
    return NextResponse.json({ ok: true, discarded: true });
  }

  const result = await trashPage(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true, trashed: result.trashed });
}
