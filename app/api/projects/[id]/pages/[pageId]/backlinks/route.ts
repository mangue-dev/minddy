import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthedUserWithRlsReads } from "@/lib/server/api-auth";
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
  // Both RLS reads overlap the live session check, which still gates the
  // response. The project key only formats identifiers at the end of
  // `pageBacklinks`, so its read runs beside the backlink queries.
  const readAll = async (supabase: SupabaseClient) => {
    const projectRead = Promise.resolve(
      supabase.from("projects").select("key").eq("id", projectId).maybeSingle()
    );
    const backlinks = pageBacklinks(supabase as unknown as BacklinkQueryable, {
      pageId,
      projectKey: projectRead.then(({ data }) => (data?.key as string | undefined) ?? ""),
    });
    // Keep a failed key read from surfacing as an unhandled rejection.
    backlinks.catch(() => undefined);
    return { project: await projectRead, backlinks };
  };
  const auth = await getAuthedUserWithRlsReads(request, ({ supabase }) => readAll(supabase));
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { project: projectResult, backlinks } = await (auth.reads ?? readAll(auth.supabase));
  const { data: project, error } = projectResult;
  if (error) {
    console.error("[api/pages/:id/backlinks] project failed:", error.message);
    backlinks.catch(() => undefined);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!project) {
    backlinks.catch(() => undefined);
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  return NextResponse.json(await backlinks);
}
