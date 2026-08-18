import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { searchProjectPages } from "@/lib/server/pages";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/pages/search?q= — search the project wiki
 * (MIN-276), title AND content.
 *
 * Each result carries its EXTRACT: on a search by content, the title
 * alone does not say why the page comes out, and it is precisely the half which
 * manquait.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await searchProjectPages({
    projectId: id,
    actorId: auth.user.id,
    query: request.nextUrl.searchParams.get("q") ?? "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.hits);
}
