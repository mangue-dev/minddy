import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { exportPage } from "@/lib/server/pages-export";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * GET /api/projects/[id]/pages/[pageId]/export — take a page (MIN-283).
 *
 * `?scope=branch` takes the page AND its subpages, and then returns a `.zip`:
 * one file per page, nesting in folders, rewritten sub-page blocks
 * into relative links. Without it, there would be only one `.md` file.
 *
 * The PDF has no route: it goes through the browser printing on the view
 * (`@media print` sheet, see app/globals.css). A PDF rendering engine in a
 * server function, it is a packet of several hundred megabytes, a
 * cold start time and a second definition of the layout to
 * hold — to produce what the browser already produces, from the document
 * which is right on screen.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await exportPage({
    pageId,
    actorId: auth.user.id,
    branch: request.nextUrl.searchParams.get("scope") === "branch",
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }

  // `filename*` in UTF-8: page titles carry accents and
  // emojis, and a bare `filename=` would make them unreadable on the browser side.
  return new NextResponse(result.body as unknown as BodyInit, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
