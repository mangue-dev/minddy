import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import { listTeamFeedback } from "@/lib/server/feedback/team-queries";
import { createFeedbackPost } from "@/lib/server/feedback/posts";
import { getBoardForProject } from "@/lib/server/feedback/boards";
import { upsertFeedbackUser } from "@/lib/server/feedback/identity";

type RouteContext = { params: Promise<{ id: string }> };

// Limits of the identity entered: an email longer than the RFC (254) does not exist
// not ; the name is cosmetic, it is truncated. Title/body are bounded by
// createFeedbackPost (FEEDBACK_TITLE_MAX / FEEDBACK_BODY_MAX).
const EMAIL_MAX = 254;
const NAME_MAX = 200;

/** GET — team list (real identities); POST — internal entry of a return
 on behalf of an end user ('internal' channel, never anonymous). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  // `board_enabled` travels WITH the list, and not in a separate call: without
  // public board, half of what the view displays makes no sense (the voices
  // that no one can give, the public/private choice which leads nowhere).
  // So both must arrive together, otherwise the screen paints itself once
  // with these commands and then remove them.
  const [posts, board] = await Promise.all([
    listTeamFeedback(id),
    getBoardForProject(id),
  ]);
  return NextResponse.json({ posts, board_enabled: board?.enabled ?? false });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  // `null` is valid JSON: reading body.title on it would make a 500, not a 400.
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: t("titleRequired") }, { status: 400 });
  }
  const user = (body.user ?? {}) as Record<string, unknown>;
  const email = typeof user.email === "string" ? user.email.trim() : "";
  if (!email.includes("@") || email.length > EMAIL_MAX) {
    return NextResponse.json({ error: t("feedbackUserRequired") }, { status: 400 });
  }

  const feedbackUser = await upsertFeedbackUser({
    projectId: id,
    email,
    name: typeof user.name === "string" ? user.name.slice(0, NAME_MAX) : null,
    verifiedVia: "api",
  });
  if (!feedbackUser) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const result = await createFeedbackPost({
    projectId: id,
    title,
    body: typeof body.body === "string" ? body.body : "",
    source: "internal",
    authorId: feedbackUser.id,
    createdByMember: guard.userId,
    // Same choice as the public board composer: publish or keep for
    // the team. Omitted (agents, historical calls) → public, as before.
    isPublic: typeof body.is_public === "boolean" ? body.is_public : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ post: result.post }, { status: 201 });
}
