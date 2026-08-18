import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isTrashType, purgeItem, restoreItem } from "@/lib/server/trash";

type RouteContext = { params: Promise<{ type: string; id: string }> };

/**
 * POST /api/me/trash/[type]/[id] — restore; DELETE — delete for good.
 * `type` ∈ issue | project | objective | feedback (MIN-133).
 *
 * Access controls live in lib/server/trash.ts, which works in key
 * service: a project member restores or purges its content, a project does not
 * responds only to its owner.
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
