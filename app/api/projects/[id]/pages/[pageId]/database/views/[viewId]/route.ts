import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  deletePageDatabaseView,
  updatePageDatabaseView,
} from "@/lib/server/page-database-views";

type Params = { params: Promise<{ id: string; pageId: string; viewId: string }> };

/** Rename, reconfigure or move a shared database view. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const { id, pageId, viewId } = await params;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const result = await updatePageDatabaseView(id, pageId, viewId, auth.user.id, input);
  if (!result.ok)
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  return NextResponse.json({ view: result.page });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id, pageId, viewId } = await params;
  const result = await deletePageDatabaseView(id, pageId, viewId, auth.user.id);
  if (!result.ok) {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return new NextResponse(null, { status: 204 });
}
