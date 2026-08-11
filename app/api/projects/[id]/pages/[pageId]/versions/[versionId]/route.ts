import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getPageVersion } from "@/lib/server/page-versions";

type RouteContext = {
  params: Promise<{ id: string; pageId: string; versionId: string }>;
};

/** GET — UNE version, corps compris : ce que l'aperçu en lecture seule monte. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { pageId, versionId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await getPageVersion(pageId, versionId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
