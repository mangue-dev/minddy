import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { boundedText } from "@/lib/server/bounded-body";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import {
  isDescriptionKind,
  readDescriptionSnapshot,
  readDescriptionSteps,
  submitDescriptionBatch,
} from "@/lib/server/description-collaboration";
import {
  MAX_COLLAB_REQUEST_BYTES,
  readCollabRevision,
  readCollabSubmission,
} from "@/lib/page-collaboration";

type RouteContext = { params: Promise<{ kind: string; id: string }> };

/** Every answer is about a live document: never cache one. */
const NO_STORE = { "Cache-Control": "no-store" };

/** Per account and minute, like page sessions (MIN-688). */
const BATCHES_PER_MINUTE = 600;
const READS_PER_MINUTE = 1_800;

const notFound = (status: 404 | 403, t: (key: "issueNotFound" | "readOnlyProject") => string) =>
  NextResponse.json({ error: t(status === 403 ? "readOnlyProject" : "issueNotFound") },
    { status, headers: NO_STORE });

/**
 * GET — live description reads (MIN-728). Without parameters: the session
 * snapshot. With `since`: the accepted steps after it, or a `reset` carrying a
 * fresh snapshot. Access is decided afresh on every read.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { kind, id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const limited = rateLimitRefusal(auth.user.id, "description-collaboration-read", { limit: READS_PER_MINUTE });
  if (limited) return limited;
  const t = await getTranslations("ApiErrors");
  if (!isDescriptionKind(kind)) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400, headers: NO_STORE });
  }

  const sinceParam = request.nextUrl.searchParams.get("since");
  if (sinceParam === null) {
    const result = await readDescriptionSnapshot(kind, id, auth.user.id);
    if (!result.ok) return notFound(result.status, t);
    return NextResponse.json(result.snapshot, { headers: NO_STORE });
  }
  const since = readCollabRevision(sinceParam);
  if (since === null) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400, headers: NO_STORE });
  }
  const result = await readDescriptionSteps(kind, id, since, auth.user.id);
  if (!result.ok) return notFound(result.status, t);
  return NextResponse.json(result.catchUp, { headers: NO_STORE });
}

/**
 * POST — one batch of steps from an editing session: `accepted` (200),
 * `behind` with the head (409: catch up, rebase, send again), `refused`
 * (400/413/422, definitive for these steps). The author is the authenticated
 * account, never a field of the request.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { kind, id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const limited = rateLimitRefusal(auth.user.id, "description-collaboration-batch", { limit: BATCHES_PER_MINUTE });
  if (limited) return limited;
  if (!isDescriptionKind(kind)) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400, headers: NO_STORE });
  }

  const text = await boundedText(request, MAX_COLLAB_REQUEST_BYTES);
  if (text === null) {
    return NextResponse.json({ error: t("documentTooLarge"), status: "refused", reason: "too-large" },
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
    return NextResponse.json({ error: t("documentTooLarge"), status: "refused", reason: "too-large" },
      { status: 413, headers: NO_STORE });
  }
  if (submission === "invalid") {
    return NextResponse.json({ error: t("documentRefused"), status: "refused", reason: "invalid-step" },
      { status: 400, headers: NO_STORE });
  }

  const result = await submitDescriptionBatch(kind, id, submission, auth.user.id);
  if (!result.ok) return notFound(result.status, t);
  const status = result.result.status === "accepted" ? 200
    : result.result.status === "behind" ? 409 : 422;
  return NextResponse.json(result.result, { status, headers: NO_STORE });
}
