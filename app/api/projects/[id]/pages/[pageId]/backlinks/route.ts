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
 * SESSION client, such as activity and history: the four readings that
 * fact `pageBacklinks` are all covered by a policy — `page_links_select`
 * (posed by migration), `attachments_select`, `issues_select`,
 * `objectives_select`, `pages_select`. Access control is therefore already written,
 * once, in base, and it is valid for the page as for each source.
 *
 * The KEY to the project comes from here and not from the layer below: it is she who
 * causes a ticket trackback to read "MIN-42" and not a UUID, and a page
 * only cites sources from his own project.
 *
 * A TRASHED page keeps its trackbacks readable — same reason as its
 * activity: “it has disappeared, who was leaning on it? » is the next question
 * the incident, not an edge case.
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
