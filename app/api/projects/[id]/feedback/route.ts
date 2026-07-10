import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import { listTeamFeedback } from "@/lib/server/feedback/team-queries";
import { createFeedbackPost } from "@/lib/server/feedback/posts";
import { upsertFeedbackUser } from "@/lib/server/feedback/identity";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — liste équipe (vraies identités) ; POST — saisie interne d'un feedback
    au nom d'un utilisateur final (canal 'internal', jamais anonyme). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  const posts = await listTeamFeedback(id);
  return NextResponse.json({ posts });
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

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: t("titleRequired") }, { status: 400 });
  }
  const user = (body.user ?? {}) as Record<string, unknown>;
  const email = typeof user.email === "string" ? user.email.trim() : "";
  if (!email.includes("@")) {
    return NextResponse.json({ error: t("feedbackUserRequired") }, { status: 400 });
  }

  const feedbackUser = await upsertFeedbackUser({
    projectId: id,
    email,
    name: typeof user.name === "string" ? user.name : null,
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
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ post: result.post }, { status: 201 });
}
