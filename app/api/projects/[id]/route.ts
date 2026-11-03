import { projectForClient } from "@/lib/server/project-content";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser, getAuthedUserWithRlsReads } from "@/lib/server/api-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateProjectSettings } from "@/lib/server/update-project";
import { softDeleteItem } from "@/lib/server/trash";
import { decodeProject } from "@/lib/server/project-content";
import { withViewerRoles } from "@/lib/server/project-access";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id] — a single accessible project (owner or member). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const readProject = (supabase: SupabaseClient) => supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  // The RLS read overlaps the live session check, which still gates the response.
  const auth = await getAuthedUserWithRlsReads(request, async ({ supabase }) => readProject(supabase));
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await (auth.reads ?? readProject(auth.supabase));

  if (error) {
    console.error("[api/projects/:id] get failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  // The role read only needs the plaintext ids, so it runs while the row decodes.
  const role = withViewerRoles(auth.user.id,
    [{ id: data.id as string, owner_id: data.owner_id as string }]).catch(() => null);
  const project = projectForClient(await decodeProject(data, auth.user.id));
  const withRole = (await role)?.[0];
  if (!withRole) {
    console.error("[api/projects/:id] role read failed");
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({
    ...project,
    my_role: withRole.my_role,
    my_can_comment: withRole.my_can_comment,
  });
}

/** PATCH /api/projects/[id] — owner-only update of name / key / color. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const result = await updateProjectSettings({
    projectId: id,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.project);
}

/**
 * DELETE /api/projects/[id] — move to trash, sole owner (MIN-133).
 * Its tickets, objectives and feedback do not move: they become visible again
 * as is when the project is restored.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await softDeleteItem("project", id, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
