import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  pageBacklinks,
  type BacklinkQueryable,
} from "@/lib/server/page-backlinks";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * GET /api/projects/[id]/pages/[pageId]/backlinks — qui cite cette page (MIN-279).
 *
 * Client de SESSION, comme l'activité et l'historique : les quatre lectures que
 * fait `pageBacklinks` sont toutes couvertes par une policy — `page_links_select`
 * (posée par la migration), `attachments_select`, `issues_select`,
 * `objectives_select`, `pages_select`. Le contrôle d'accès est donc déjà écrit,
 * une fois, en base, et il vaut pour la page comme pour chaque source.
 *
 * La CLÉ du projet vient d'ici et pas de la couche du dessous : c'est elle qui
 * fait qu'un rétrolien de ticket se lit « MIN-42 » et pas un UUID, et une page
 * ne cite que des sources de son propre projet.
 *
 * Une page CORBEILLÉE garde ses rétroliens lisibles — même raison que son
 * activité : « ça a disparu, qui s'appuyait dessus ? » est la question d'après
 * l'incident, pas un cas tordu.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id: projectId, pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data: project, error } = await auth.supabase
    .from("projects")
    .select("key")
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    console.error("[api/pages/:id/backlinks] project failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  return NextResponse.json(
    await pageBacklinks(auth.supabase as unknown as BacklinkQueryable, {
      pageId,
      projectKey: (project.key as string) ?? "",
    })
  );
}
