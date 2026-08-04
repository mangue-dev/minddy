import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/project-drafts/[id] — jeter un brouillon.
 *
 * Deux appelants : le menu contextuel de la barre latérale (« Supprimer le
 * brouillon »), et le wizard lui-même une fois le projet créé — le brouillon a
 * alors fait son travail. Pas de corbeille : un brouillon n'est pas une donnée
 * du projet, c'est un formulaire à moitié rempli.
 *
 * La RLS fait le tri (on ne supprime que les siens) : un id inconnu ne touche
 * aucune ligne et répond quand même 204 — la suppression est idempotente, et
 * rejouer un DELETE ne doit pas afficher d'erreur.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { error } = await auth.supabase
    .from("project_drafts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[api/project-drafts/:id] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
