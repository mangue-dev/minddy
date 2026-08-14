import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { regenerateProjectOrbSeed } from "@/lib/server/project-orb";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Orbe du projet — owner uniquement.
 *
 * POST → relance le tirage et répond { orb_seed }. C'est la seule prise qu'on a
 * sur l'orbe : elle ne se choisit pas, exactement comme l'avatar d'un compte
 * (`/api/me/avatar`). Elle vit à côté de `…/icon` et non dedans, parce que ce
 * n'est pas la même ressource : l'icône est une image importée, l'orbe est ce
 * qui s'affiche quand il n'y en a pas.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }

  // Un bouton qu'on peut marteler : le plafond est là pour la base, pas contre
  // l'utilisateur — relancer dix fois de suite pour trouver sa couleur est
  // exactement l'usage prévu.
  const refused = rateLimitRefusal(auth.user.id, "orb-reroll", { limit: 60 });
  if (refused) return refused;

  try {
    return NextResponse.json({ orb_seed: await regenerateProjectOrbSeed(id) });
  } catch (err) {
    console.error("[api/projects/orb] regenerate failed:", err);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
