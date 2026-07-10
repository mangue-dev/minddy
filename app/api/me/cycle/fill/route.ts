import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { ensureCycles, fillCycleForUser, todayInTz } from "@/lib/server/cycles";
import { resolveCyclePrefs } from "@/lib/cycle-prefs";

/**
 * POST /api/me/cycle/fill — top up MY current cycle with the deterministic
 * engine (MIN-32). The UI's "refill" affordance on a fully-completed cycle:
 * the person clicks, the engine picks — same governance as everywhere else.
 * Numo and the MCP call fillCycleForUser directly; this is the browser's path.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const prefs = resolveCyclePrefs(
    (auth.user.user_metadata ?? null) as Record<string, unknown> | null
  );
  if (!prefs.enabled) {
    return NextResponse.json({ error: "Cycles are not enabled." }, { status: 400 });
  }

  const service = getServiceClient();
  const ensured = await ensureCycles({
    service,
    userId: auth.user.id,
    prefs,
    today: todayInTz(request.nextUrl.searchParams.get("tz")),
  });
  if (!ensured.current) {
    return NextResponse.json({ error: "No current cycle." }, { status: 400 });
  }

  const { pickedIds, points } = await fillCycleForUser({
    service,
    userId: auth.user.id,
    actorId: auth.user.id,
    cycle: ensured.current,
  });
  return NextResponse.json({ added: pickedIds.length, added_points: points });
}
