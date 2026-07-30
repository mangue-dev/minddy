import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isTrashType, purgeItem, restoreItem } from "@/lib/server/trash";

type RouteContext = { params: Promise<{ type: string; id: string }> };

/**
 * POST /api/me/trash/[type]/[id] — restaurer ; DELETE — supprimer pour de bon.
 * `type` ∈ issue | project | objective | feedback (MIN-133).
 *
 * Les contrôles d'accès vivent dans lib/server/trash.ts, qui travaille en clé
 * service : un membre du projet restaure ou purge son contenu, un projet ne
 * répond qu'à son propriétaire.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  return run(request, params, "restore");
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return run(request, params, "purge");
}

async function run(
  request: NextRequest,
  params: RouteContext["params"],
  action: "restore" | "purge"
) {
  const { type, id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  if (!isTrashType(type)) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const result =
    action === "restore"
      ? await restoreItem(type, id, auth.user.id)
      : await purgeItem(type, id, auth.user.id);

  if (!result.ok) {
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true });
}
