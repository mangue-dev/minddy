import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { deleteConnection } from "@/lib/server/git/connections";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/account/git-connections/[id] — déconnecte un compte git. Les
 * liaisons projet qui l'utilisent tombent en cascade (project_git_links).
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const ok = await deleteConnection(auth.user.id, id);
  if (!ok) {
    return NextResponse.json(
      { error: t("gitConnectionNotFound") },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
