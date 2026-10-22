import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  createPageDatabaseView,
  listPageDatabaseViews,
} from "@/lib/server/page-database-views";

type Params = { params: Promise<{ id: string; pageId: string }> };

/** The saved views of a database page, in the order of its view strip. */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id, pageId } = await params;
  const result = await listPageDatabaseViews(id, pageId, auth.user.id);
  if (!result.ok) {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ views: result.page });
}

/** Add a view every member of the project sees. */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const { id, pageId } = await params;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const result = await createPageDatabaseView(id, pageId, auth.user.id, input);
  if (!result.ok)
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  return NextResponse.json({ view: result.page }, { status: 201 });
}
