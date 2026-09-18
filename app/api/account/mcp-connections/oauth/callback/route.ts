import { NextResponse, type NextRequest } from "next/server";
import { readForgeCallbackSession } from "@/lib/server/git/callback-session";
import { oauthAppOrigin } from "@/lib/server/app-origin";
import { completeMcpOAuth } from "@/lib/server/mcp-oauth";
import { MCP_DESKTOP_RETURN_COOKIE } from "@/lib/mcp-authorization";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const session = await readForgeCallbackSession(request);
  // Same origin as the callback itself: the session and the desktop-return
  // cookie live there. The deployment URL would cross origins and log the
  // browser out.
  const returnUrl = new URL("/settings", oauthAppOrigin());
  returnUrl.searchParams.set("tab", "mcp-clients");
  try {
    if (!session.userId || request.nextUrl.searchParams.has("error"))
      throw new Error("OAuth authorization canceled");
    await completeMcpOAuth(
      session.userId,
      request.nextUrl.searchParams.get("state") ?? "",
      request.nextUrl.searchParams.get("code") ?? "",
      request.nextUrl.searchParams.get("iss") ?? undefined,
    );
    returnUrl.searchParams.set("mcp", "connected");
  } catch {
    returnUrl.searchParams.set("mcp", "error");
  }
  // A flow launched from the desktop app ends its browser detour here: the
  // bounce page reopens the app on the settings page, where the outcome is
  // announced and the connections list refreshes. Without it the user stayed
  // stranded in the browser while the app kept showing the old state.
  const returnCookie = request.cookies.get(MCP_DESKTOP_RETURN_COOKIE)?.value;
  const destination = returnCookie
    ? new URL("/desktop/return", oauthAppOrigin())
    : returnUrl;
  if (returnCookie)
    destination.searchParams.set("next", `${returnUrl.pathname}${returnUrl.search}`);
  const response = NextResponse.redirect(destination);
  if (returnCookie) response.cookies.delete(MCP_DESKTOP_RETURN_COOKIE);
  return session.applyCookies(response);
}
