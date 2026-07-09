import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { removeIssueRelation } from "@/lib/server/issue-relations";

type RouteContext = { params: Promise<{ id: string }> };

/** DELETE /api/issue-relations/[id] — remove a relation (access enforced in
    the core, which resolves the project from the relation row). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await removeIssueRelation({
    relationId: id,
    actorId: auth.user.id,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
