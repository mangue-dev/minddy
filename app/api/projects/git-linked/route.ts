import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * GET /api/projects/git-linked — les projets accessibles qui ont un DÉPÔT lié.
 *
 * L'agent clone un dépôt : un projet qui n'en a pas n'est pas un projet où le
 * lancer. La page Agents s'en sert pour ne proposer que ceux-là, plutôt que de
 * laisser choisir puis refuser (`noRepo`) une fois le message écrit.
 *
 * Une seule requête pour TOUS les projets — l'état de liaison se lisait jusqu'ici
 * projet par projet (`/api/projects/[id]/git-link`), ce qui va pour un panneau
 * de ticket mais pas pour peupler un sélecteur.
 *
 * Ne rend que des IDS : le reste du lien (dépôt, branche par défaut, compte) est
 * du détail de réglages, et le sélecteur n'en a pas besoin. La RLS
 * `project_git_links_select` (`can_access_project`) fait le filtrage.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("project_git_links")
    .select("project_id");

  if (error) {
    console.error("[api/projects/git-linked] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const projectIds = [
    ...new Set(
      (data ?? [])
        .map((row) => row.project_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  return NextResponse.json({ projectIds });
}
