import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { revokeGrant } from "@/lib/server/oauth/grants";

type RouteContext = { params: Promise<{ grantId: string }> };

/** DELETE /api/account/oauth-grants/[grantId] — revoke a connected app
    (grant + its actor api_keys row): its tokens stop working immediately. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { grantId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await revokeGrant({ userId: auth.user.id, grantId });
  if (!result.ok) {
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true });
}
