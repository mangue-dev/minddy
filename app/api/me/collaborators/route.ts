import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { listCollaborators } from "@/lib/server/collaborators";

/**
 * GET /api/me/collaborators — the people the caller already works with: who
 * has joined one of the caller's projects (owner, member or reader), with a
 * verified email (MIN-689). The project wizard proposes them by name.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const collaborators = await listCollaborators(getServiceClient(), auth.user.id);
    return NextResponse.json({ collaborators });
  } catch (error) {
    console.error("[api/me/collaborators] list failed:", (error as Error).message);
    const t = await getTranslations("ApiErrors");
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
