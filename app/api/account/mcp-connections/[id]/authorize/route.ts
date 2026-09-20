import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getMcpConnection } from "@/lib/server/mcp-client";
import { startMcpOAuth } from "@/lib/server/mcp-oauth";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { MCP_DESKTOP_RETURN_COOKIE } from "@/lib/mcp-authorization";
export const maxDuration = 60;

/**
 * Starts OAuth for one of the caller's MCP connections.
 *
 * Body `{ "desktop": true }` marks a flow launched from the desktop app: the
 * response plants `mcp_desktop_return`, and the callback uses it to bounce the
 * system browser back to the app. The flag only steers a redirect.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const limited = rateLimitRefusal(auth.user.id, "mcp-oauth", { limit: 10 });
  if (limited) return limited;
  let desktop = false;
  if (request.body !== null) {
    try {
      const body = (await request.json()) as { desktop?: unknown };
      desktop = body?.desktop === true;
    } catch {
      // Anything unreadable falls back to the plain web flow.
    }
  }
  try {
    const connection = await getMcpConnection(
      auth.user.id,
      (await context.params).id,
    );
    if (!connection)
      return NextResponse.json({ error: "missing" }, { status: 404 });
    const response = NextResponse.json({
      url: await startMcpOAuth(connection),
    });
    if (desktop)
      response.cookies.set(MCP_DESKTOP_RETURN_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        // The attempt row expires after ten minutes; the flag lives no longer.
        maxAge: 600,
        path: "/",
      });
    return response;
  } catch {
    return NextResponse.json({ error: "oauth" }, { status: 400 });
  }
}
