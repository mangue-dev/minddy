import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { updatePageDatabase } from "@/lib/server/page-databases";

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; pageId: string }>;
  },
) {
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
  const result = await updatePageDatabase(id, pageId, auth.user.id, input);
  if (!result.ok)
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status },
    );
  return NextResponse.json(result.page);
}
