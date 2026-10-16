import { loadGlobalBoardIssues } from "@/lib/server/global-board-issues";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { mapIssueRow } from "@/lib/server/issue-mapper";

/**
 * GET /api/me/issues — the authoritative issue slice of the global board.
 *
 * Realtime broadcasts are intentionally ephemeral. After a suspended or
 * unfocused window, the client therefore needs a snapshot to close any gap.
 * `/api/me/board` also resolves members, integrations, relations, and cycles;
 * that is useful reconciliation work, but it can take several seconds and must
 * not leave stale card positions visible in the meantime. This route performs
 * a complete RLS-scoped issue read needed to make both Kanban caches trustworthy.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await loadGlobalBoardIssues(auth.supabase, auth.user.id);

  if (error) {
    console.error("[api/me/issues] load failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapIssueRow));
}
