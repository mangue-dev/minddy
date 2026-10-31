import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getObjectiveForecast } from "@/lib/server/objective-forecast";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/objectives/[id]/forecast?tz=… — the objective's finish estimate,
    computed from its contributors' activity and allocation (MIN-876). Only
    the aggregate date is returned; project access is checked first. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const timeZone = request.nextUrl.searchParams.get("tz") || "UTC";
  try {
    const forecast = await getObjectiveForecast(auth.user.id, id, { timeZone });
    if (!forecast) {
      return NextResponse.json({ error: t("objectiveNotFound") }, { status: 404 });
    }
    return NextResponse.json(forecast, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[api/objectives/:id/forecast] failed:", (e as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
