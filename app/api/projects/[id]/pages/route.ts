import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { createPage, listPages } from "@/lib/server/pages";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/pages — all live pages in the project, FLAT.
 *
 * A single request, without the body of the documents: the tree is reconstructed at
 * the caller (`buildPageTree`, lib/pages.ts). This is what allows for depth
 * unlimited without recursive CTE or N+1.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await listPages(id, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.pages);
}

/**
 * POST /api/projects/[id]/pages — create a page (any project member).
 *
 * The body arrives in JSON ProseMirror (`content`), as the editor
 * product, or in MARKDOWN (`markdown`) — the project wizard uses it to
 * place the brief pasted on the page. The toggle is in `createPage`, with the rest
 * writing rules.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // Create a page writes a line AND, offline, mounts a server editor
  // to project the indexed text: it is the most expensive writing of the
  // wiki, and nothing limited the loop that creates a thousand (MIN-348).
  const refused = rateLimitRefusal(auth.user.id, "page-create", { limit: 30 });
  if (refused) return refused;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const result = await createPage({
    projectId: id,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.page, { status: 201 });
}
