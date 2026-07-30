import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { emptyTrash, listTrash, TRASH_RETENTION_DAYS } from "@/lib/server/trash";

/**
 * GET /api/me/trash — ce que je peux encore rattraper, tous projets confondus
 * (MIN-133). DELETE — vider la corbeille d'un coup.
 *
 * `retention_days` voyage avec la liste plutôt que d'être écrit en dur côté
 * client : la durée annoncée à l'écran et celle qu'applique le balayage nocturne
 * sont la même constante, dans lib/server/trash.ts.
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
