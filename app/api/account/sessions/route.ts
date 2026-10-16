import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { listAuthSessions } from "@/lib/server/auth-sessions";

/**
 * The account's live sessions, for the Security settings list.
 *
 * Read-only: ending sessions stays a browser gesture through GoTrue
 * (`auth.signOut({ scope: "others" })`), which revokes the refresh tokens.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    const sessions = await listAuthSessions(
      auth.user.id,
      String(auth.claims.session_id),
    );
    return NextResponse.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[account-sessions] lookup_failed");
    return NextResponse.json({ error: "Sessions unavailable" }, { status: 500 });
  }
}
