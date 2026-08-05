import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import { listTeamFeedback } from "@/lib/server/feedback/team-queries";
import { createFeedbackPost } from "@/lib/server/feedback/posts";
import { getBoardForProject } from "@/lib/server/feedback/boards";
import { upsertFeedbackUser } from "@/lib/server/feedback/identity";

type RouteContext = { params: Promise<{ id: string }> };

// Bornes de l'identité saisie : un email plus long que la RFC (254) n'existe
// pas ; le nom est cosmétique, on le tronque. Titre/corps sont bornés par
// createFeedbackPost (FEEDBACK_TITLE_MAX / FEEDBACK_BODY_MAX).
const EMAIL_MAX = 254;
const NAME_MAX = 200;

/** GET — liste équipe (vraies identités) ; POST — saisie interne d'un retour
    au nom d'un utilisateur final (canal 'internal', jamais anonyme). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  // `board_enabled` voyage AVEC la liste, et non dans un appel à part : sans
  // board public, la moitié de ce que la vue affiche n'a pas de sens (les voix
  // que personne ne peut donner, le choix public/privé qui ne mène nulle part).
  // Les deux doivent donc arriver ensemble, sinon l'écran se peint une fois
  // avec ces commandes puis les retire.
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
  // `null` est du JSON valide : lire body.title dessus ferait un 500, pas un 400.
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
    // Même choix que le composeur du board public : publier ou garder pour
    // l'équipe. Omis (agents, appels historiques) → public, comme avant.
    isPublic: typeof body.is_public === "boolean" ? body.is_public : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ post: result.post }, { status: 201 });
}
