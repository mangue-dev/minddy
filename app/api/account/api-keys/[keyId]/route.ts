import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { revokeApiKey } from "@/lib/server/api-keys";

type RouteContext = { params: Promise<{ keyId: string }> };

/** DELETE /api/account/api-keys/[keyId] — revoke the caller's key (soft:
    sets revoked_at, the row survives so the settings list keeps its name). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { keyId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await revokeApiKey({ userId: auth.user.id, keyId });
  if (!result.ok) {
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true });
}
