import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  readPageCollaborationSnapshot,
  readPageCollaborationSteps,
  submitPageCollaboration,
} from "@/lib/server/pages";
import {
  isCollabField,
  readCollabRevision,
  readCollabSubmission,
} from "@/lib/page-collaboration";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/** Every answer is about a live document: never cache one. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET — live collaboration reads (MIN-688).
 *
 * Without parameters: the session snapshot, both streams from one row read.
 * With `field` and `since`: the accepted steps of that stream after `since`,
 * or a `reset` carrying a fresh snapshot when the journal cannot bridge it.
 *
 * Authentication (live session, MFA level, same origin) comes first, then the
 * project/page match and current membership: a revoked member's open tab stops
 * receiving the document on its next read.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id, pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const field = request.nextUrl.searchParams.get("field");
  if (field === null) {
    const result = await readPageCollaborationSnapshot(id, pageId, auth.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: t(result.errorKey) }, { status: result.status, headers: NO_STORE });
    }
    return NextResponse.json(result.snapshot, { headers: NO_STORE });
  }

  const since = readCollabRevision(request.nextUrl.searchParams.get("since"));
  if (!isCollabField(field) || since === null) {
    return NextResponse.json({ error: t("pageContentRefused") }, { status: 400, headers: NO_STORE });
  }
  const result = await readPageCollaborationSteps({
    projectId: id,
    pageId,
    actorId: auth.user.id,
    field,
    since,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status, headers: NO_STORE });
  }
  return NextResponse.json(result.catchUp, { headers: NO_STORE });
}

/**
 * POST — one batch of steps from an editing session.
 *
 * `accepted` advances the stream; `behind` asks the session to catch up and
 * rebase (409); `refused` is definitive for these steps (422). The author is the
 * authenticated account, never a field of the request.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id, pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400, headers: NO_STORE });
  }
  const submission = readCollabSubmission(body);
  if (submission === "too-large") {
    return NextResponse.json({ error: t("pageTooLarge"), status: "refused", reason: "too-large" },
      { status: 413, headers: NO_STORE });
  }
  if (submission === "invalid") {
    return NextResponse.json({ error: t("pageContentRefused"), status: "refused", reason: "invalid-step" },
      { status: 400, headers: NO_STORE });
  }

  const result = await submitPageCollaboration({
    projectId: id,
    pageId,
    actorId: auth.user.id,
    submission,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status, headers: NO_STORE });
  }
  const status = result.result.status === "accepted" ? 200
    : result.result.status === "behind" ? 409 : 422;
  return NextResponse.json(result.result, { status, headers: NO_STORE });
}
