import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { setIssueCategories } from "@/lib/server/set-issue-categories";

type RouteContext = { params: Promise<{ id: string }> };

// Board terminal (MIN-118) — a ticket never has so many labels.
const MAX_CATEGORY_IDS = 100;

/** PUT /api/issues/[id]/categories { category_ids } — replace the issue's category set. */
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
  const raw = (body as { category_ids?: unknown })?.category_ids;
  const requested = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string").slice(0, MAX_CATEGORY_IDS)
    : [];

  const result = await setIssueCategories({
    issueId: id,
    actorId: auth.user.id,
    categoryIds: requested,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json({ category_ids: result.categoryIds });
}
