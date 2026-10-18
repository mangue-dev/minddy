import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { readRichDocument } from "@/lib/server/rich-documents";

type RouteContext = { params: Promise<{ kind: string; id: string }> };

/** The project-owned parents, readable through the caller's own RLS. */
/**
 * GET /api/documents/[kind]/[id] — the editor document of an issue or
 * objective description, or of the caller's notebook (MIN-728). `{ content: null }` when there is
 * none: the surface then opens its Markdown, which is always there.
 *
 * Access is the parent's: it is read first with the caller's client, so RLS
 * decides; the document itself is service-only and never read otherwise.
 * `id` is the issue or objective id, or `me` for the notebook.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { kind, id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  if (kind === "notebook") {
    if (id !== "me") return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
    const content = await readRichDocument({ kind, id: auth.user.id, projectId: null }, auth.user.id);
    return NextResponse.json({ content });
  }
  if (kind !== "issue" && kind !== "objective") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  const parent = kind === "issue"
    ? auth.supabase.from("issues").select("id, project_id")
    : auth.supabase.from("objectives").select("id, project_id");
  const { data, error } = await parent.eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) {
    console.error("[api/documents] parent read failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data || typeof data.project_id !== "string") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 404 });
  }
  const content = await readRichDocument(
    { kind, id, projectId: data.project_id },
    auth.user.id
  );
  return NextResponse.json({ content }, { headers: { "Cache-Control": "private, no-store" } });
}
