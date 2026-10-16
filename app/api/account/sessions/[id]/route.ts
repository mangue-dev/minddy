import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { revokeAuthSession } from "@/lib/server/auth-sessions";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Ends one other session of the account (“Sign out” on a session row).
 *
 * The session to end comes from the URL, the account and the caller's own
 * session from the verified claims. A session that is not one of the caller's
 * other live sessions answers 404, whether it is this device, another
 * account's, or already gone.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const revoked = await revokeAuthSession(
      auth.user.id,
      id,
      String(auth.claims.session_id),
    );
    if (!revoked) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch {
    console.error("[account-sessions] revoke_failed");
    return NextResponse.json({ error: "Session revocation failed" }, { status: 500 });
  }
}
