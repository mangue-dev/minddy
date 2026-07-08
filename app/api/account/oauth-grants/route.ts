import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { listGrantsForUser } from "@/lib/server/oauth/grants";

/** GET /api/account/oauth-grants — the caller's connected OAuth apps. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const grants = await listGrantsForUser(auth.user.id);
  if (!grants) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ grants });
}
