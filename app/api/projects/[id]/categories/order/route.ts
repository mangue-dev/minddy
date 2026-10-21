import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { reorderCategories } from "@/lib/server/categories";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/projects/[id]/categories/order — reorder the project's categories
 * (MIN-760). Body: `{ category_ids }`, listed first in that order; the others
 * follow in their current order. Returns the categories in their new order.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const result = await reorderCategories({
    projectId: id,
    actorId: auth.user.id,
    categoryIds: (body as { category_ids?: unknown } | null)?.category_ids,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json(result.categories);
}
