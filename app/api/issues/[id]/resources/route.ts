import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import {
  insertAttachments,
  parseResourcesInput,
} from "@/lib/server/attachments";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/issues/[id]/resources — the issue-LEVEL resources, files and links
    alike (not the ones on comments), RLS-scoped to project members. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("attachments")
    .select("*")
    .eq("issue_id", id)
    .is("comment_id", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/issues/:id/resources] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

/** POST /api/issues/[id]/resources — register resources on an existing issue:
    files already uploaded to storage by the client, links already resolved by
    /api/projects/[id]/link-preview. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const rl = checkSessionRateLimit(auth.user.id, "issue-resource-create");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const service = getServiceClient();
  const { data: issue } = await service
    .from("issues")
    .select("project_id")
    .is("deleted_at", null)
    .eq("id", id)
    .maybeSingle();
  if (!issue) {
    return NextResponse.json({ error: t("issueNotFound") }, { status: 404 });
  }
  const access = await getProjectAccess(auth.user.id, issue.project_id as string);
  if (!access) {
    return NextResponse.json({ error: t("issueNotFound") }, { status: 404 });
  }

  const resources = parseResourcesInput(
    (body as { resources?: unknown })?.resources,
    `projects/${issue.project_id}/`
  );
  if (resources === null || resources.length === 0) {
    return NextResponse.json({ error: t("resourceInvalid") }, { status: 400 });
  }

  try {
    const rows = await insertAttachments(service, {
      projectId: issue.project_id as string,
      issueId: id,
      commentId: null,
      createdBy: auth.user.id,
      resources,
    });
    return NextResponse.json(rows, { status: 201 });
  } catch (e) {
    console.error("[api/issues/:id/resources] insert failed:", (e as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
