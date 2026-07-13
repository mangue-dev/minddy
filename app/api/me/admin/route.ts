import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";

/**
 * GET /api/me/admin — whether the current user is a minddy admin. The client
 * can't evaluate the `ADMIN_EMAILS` allowlist itself, so the sidebar reads this
 * to decide whether to show the "Admin dashboard" entry. The route + layout
 * enforce access server-side regardless of what the client believes.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ isAdmin: isAdminUser(auth.user) });
}
