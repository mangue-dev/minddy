import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { setProjectHidden } from "@/lib/server/hidden-projects";

type RouteContext = { params: Promise<{ projectId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT hides the project for me, DELETE shows it again (MIN-692). Both are
 * idempotent and only touch my own preference: the project, its members and
 * its activity are left as they are.
 */
async function handle(request: NextRequest, { params }: RouteContext, hidden: boolean) {
  const { projectId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  try {
    const result = await setProjectHidden(auth.supabase, auth.user.id, projectId, hidden);
    if (result === "not_found") {
      return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    console.error("[api/account/hidden-projects/:id] write failed");
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}

export function PUT(request: NextRequest, context: RouteContext) {
  return handle(request, context, true);
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return handle(request, context, false);
}
