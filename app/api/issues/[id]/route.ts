import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import { updateIssueFields } from "@/lib/server/update-issue";
import { softDeleteItem } from "@/lib/server/trash";

type RouteContext = { params: Promise<{ id: string }> };

// Headroom for the Smart Assign after() run (one AI call post-response).
export const maxDuration = 60;

/** GET /api/issues/[id] — a single issue (RLS: caller can access its project). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("issues")
    .select(ISSUE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[api/issues/:id] get failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("issueNotFound") }, { status: 404 });
  return NextResponse.json(mapIssueRow(data));
}

/** PATCH /api/issues/[id] — update fields (access enforced in updateIssueFields). */
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

  const result = await updateIssueFields({
    issueId: id,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json(result.issue);
}

/**
 * DELETE /api/issues/[id] — passage en corbeille (MIN-133).
 *
 * Rien n'est détruit : la ligne est marquée et sort des lectures par la policy
 * `issues_select`. Ses commentaires, pièces jointes, sous-tickets et relations
 * restent en place — c'est ce qui permet de la restaurer telle quelle. Le vrai
 * `delete`, celui qui cascade et efface les objets du storage, n'arrive qu'à la
 * purge (lib/server/trash.ts), manuelle ou au bout de 30 jours.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await softDeleteItem("issue", id, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
