import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { createPage, listPages } from "@/lib/server/pages";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/pages — toutes les pages vivantes du projet, À PLAT.
 *
 * Une seule requête, sans le corps des documents : l'arbre se reconstruit chez
 * l'appelant (`buildPageTree`, lib/pages.ts). C'est ce qui permet la profondeur
 * illimitée sans CTE récursive ni N+1.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await listPages(id, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.pages);
}

/**
 * POST /api/projects/[id]/pages — créer une page (tout membre du projet).
 *
 * Le corps arrive en JSON ProseMirror (`content`), tel que l'éditeur le
 * produit, ou en MARKDOWN (`markdown`) — le wizard de projet s'en sert pour
 * poser le brief collé en page. La bascule est dans `createPage`, avec le reste
 * des règles d'écriture.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // Créer une page écrit une ligne ET, en différé, monte un éditeur serveur
  // pour en projeter le texte indexé : c'est la plus chère des écritures du
  // wiki, et rien ne bornait la boucle qui en crée mille (MIN-348).
  const refused = rateLimitRefusal(auth.user.id, "page-create", { limit: 30 });
  if (refused) return refused;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const result = await createPage({
    projectId: id,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.page, { status: 201 });
}
