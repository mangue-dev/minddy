import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  addIssueRelation,
  listIssueRelations,
} from "@/lib/server/issue-relations";
import { isRelationType } from "@/lib/relation-constants";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/issue-relations — every relation of the project. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await listIssueRelations(auth.supabase, id);
  if ("error" in result) {
    console.error("[api/issue-relations] list failed:", result.error);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(result.relations);
}

/** POST /api/projects/[id]/issue-relations — add a relation (access enforced
    in the core). Body: { source_id, target_id, type }. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const { source_id, target_id, type } = (body ?? {}) as Record<string, unknown>;
  if (typeof source_id !== "string" || typeof target_id !== "string") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  if (!isRelationType(type)) {
    return NextResponse.json({ error: t("invalidRelationType") }, { status: 400 });
  }

  const result = await addIssueRelation({
    projectId: id,
    actorId: auth.user.id,
    sourceId: source_id,
    targetId: target_id,
    type,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json(result.relation, { status: 201 });
}
