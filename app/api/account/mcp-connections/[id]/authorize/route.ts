import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getMcpConnection } from "@/lib/server/mcp-client";
import {
  McpClientNotApprovedError,
  McpOAuthAppRequiredError,
  startMcpOAuth,
} from "@/lib/server/mcp-oauth";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
export const maxDuration = 60;

/**
 * Starts OAuth for one of the caller's MCP connections.
 *
 * Body `{ "desktop": true }` marks a flow launched from the desktop app
 * (MIN-912): its state tells the callback to hand the provider's answer back
 * to the app, which redeems it with this same session. The flag only steers
 * a redirect.
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
    return NextResponse.json({
      url: await startMcpOAuth(connection, { desktop }),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof McpClientNotApprovedError
            ? "oauth_client_rejected"
            : err instanceof McpOAuthAppRequiredError
              ? "oauth_app_required"
              : "oauth",
      },
      { status: 400 },
    );
  }
}
