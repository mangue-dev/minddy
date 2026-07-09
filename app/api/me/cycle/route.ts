import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { ensureCycles, toCycleInfo, todayInTz } from "@/lib/server/cycles";
import { resolveCyclePrefs } from "@/lib/cycle-prefs";

/**
 * GET /api/me/cycle — the user's CURRENT cycle only (MIN-32), for surfaces
 * that need to offer "add to cycle" without paying for the whole board
 * payload (the project boards' right-click menu). Runs the same lazy
 * reconciliation as GET /api/me/board, so whichever surface loads first
 * keeps the timeline current. `?tz=` resolves the user's calendar day.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const prefs = resolveCyclePrefs(
    (auth.user.user_metadata ?? null) as Record<string, unknown> | null
  );
  if (!prefs.enabled) {
    return NextResponse.json({ enabled: false, current: null });
  }

  const ensured = await ensureCycles({
    service: getServiceClient(),
    userId: auth.user.id,
    prefs,
    today: todayInTz(request.nextUrl.searchParams.get("tz")),
  });
  return NextResponse.json({
    enabled: true,
    current: ensured.current ? toCycleInfo(ensured.current) : null,
  });
}
