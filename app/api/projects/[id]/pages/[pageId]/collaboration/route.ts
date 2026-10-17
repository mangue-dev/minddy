import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  readPageCollaborationSnapshot,
  readPageCollaborationSteps,
  submitPageCollaboration,
} from "@/lib/server/pages";
import { COLLAB_TOKEN_HEADER } from "@/lib/server/page-collaboration-token";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import {
  MAX_COLLAB_REQUEST_BYTES,
  isCollabField,
  readCollabRevision,
  readCollabSubmission,
} from "@/lib/page-collaboration";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/** Every answer is about a live document: never cache one. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Per account and minute. A session sends at most four batches a second per
 * stream; catch-ups follow peers' wake-ups. Several open tabs fit; a script
 * hammering the journal does not.
 */
const BATCHES_PER_MINUTE = 600;
const READS_PER_MINUTE = 1_800;

/**
 * The request body as text, refused past `limit` bytes without reading the
 * rest: `request.json()` would buffer any size before the batch is bounded.
 */
async function boundedText(request: NextRequest, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** The answer's headers, with the session's renewed collaboration token. */
const withToken = (token: string | null) =>
  token ? { ...NO_STORE, [COLLAB_TOKEN_HEADER]: token } : NO_STORE;

/**
 * GET — live collaboration reads (MIN-688).
 *
 * Without parameters: the session snapshot, both streams from one row read.
 * With `field` and `since`: the accepted steps of that stream after `since`,
 * or a `reset` carrying a fresh snapshot when the journal cannot bridge it.
 *
 * Authentication (live session, MFA level, same origin) comes first, then the
 * project/page match and current membership: a revoked member's open tab stops
 * receiving the document on its next read. Every read answers with a renewed
 * collaboration token (`x-minddy-collab-token`) for the session's batches.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id, pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const limited = rateLimitRefusal(auth.user.id, "page-collaboration-read", { limit: READS_PER_MINUTE });
  if (limited) return limited;
  const t = await getTranslations("ApiErrors");

  const field = request.nextUrl.searchParams.get("field");
  if (field === null) {
    const result = await readPageCollaborationSnapshot(id, pageId, auth.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: t(result.errorKey) }, { status: result.status, headers: NO_STORE });
    }
    return NextResponse.json(result.snapshot, { headers: withToken(result.token) });
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
  return NextResponse.json(result.catchUp, { headers: withToken(result.token) });
}

/**
 * POST — one batch of steps from an editing session.
 *
 * `accepted` advances the stream; `behind` asks the session to catch up and
 * rebase (409); `refused` is definitive for these steps (422). The author is the
 * authenticated account, never a field of the request. The session's
 * collaboration token stands for the project access check; the account is
 * still authenticated live here, on every batch.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id, pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const limited = rateLimitRefusal(auth.user.id, "page-collaboration-batch", { limit: BATCHES_PER_MINUTE });
  if (limited) return limited;

  const text = await boundedText(request, MAX_COLLAB_REQUEST_BYTES);
  if (text === null) {
    return NextResponse.json({ error: t("pageTooLarge"), status: "refused", reason: "too-large" },
      { status: 413, headers: NO_STORE });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
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
    token: request.headers.get(COLLAB_TOKEN_HEADER),
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status, headers: NO_STORE });
  }
  const status = result.result.status === "accepted" ? 200
    : result.result.status === "behind" ? 409 : 422;
  return NextResponse.json(result.result, { status, headers: withToken(result.token) });
}
