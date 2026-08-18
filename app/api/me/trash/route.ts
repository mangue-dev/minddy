import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { emptyTrash, listTrash, TRASH_RETENTION_DAYS } from "@/lib/server/trash";

/**
 * GET /api/me/trash — what I can still catch, all projects combined
 * (MIN-133). DELETE — empty the trash at once.
 *
 * `retention_days` travels with the list rather than being written hard side
 * client: the duration announced on the screen and that applied by night scanning
 * are the same constant, in lib/server/trash.ts.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  try {
    const items = await listTrash(auth.user.id, auth.supabase);
    return NextResponse.json({ items, retention_days: TRASH_RETENTION_DAYS });
  } catch (e) {
    console.error("[api/me/trash] list failed:", (e as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  try {
    const { purged } = await emptyTrash(auth.user.id, auth.supabase);
    return NextResponse.json({ ok: true, purged });
  } catch (e) {
    console.error("[api/me/trash] empty failed:", (e as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
