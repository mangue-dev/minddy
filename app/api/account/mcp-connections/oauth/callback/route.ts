import { NextResponse, type NextRequest } from "next/server";
import { readForgeCallbackSession } from "@/lib/server/git/callback-session";
import { oauthAppOrigin } from "@/lib/server/app-origin";
import {
  completeMcpOAuth,
  isDesktopMcpOAuthState,
} from "@/lib/server/mcp-oauth";
import {
  encodeMcpOAuthReturn,
  MCP_OAUTH_RETURN_PARAM,
} from "@/lib/mcp-authorization";
import { DESKTOP_RETURN_PATH } from "@/lib/desktop/config";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  // Same origin as the callback itself: the session cookies live there. The
  // deployment URL would cross origins and log the browser out.
  const returnUrl = new URL("/settings", oauthAppOrigin());
  returnUrl.searchParams.set("tab", "agent");

  // A flow started in the desktop app (MIN-912) is redeemed by the app, with
  // the session that started it: this browser may have no minddy session at
  // all. The answer goes back through `/desktop/return`, which reopens the
  // app on its settings page. Nothing is exchanged here, so a victim lured
  // into someone else's flow only sends the code to their own app, whose
  // session does not own the attempt.
  if (isDesktopMcpOAuthState(state)) {
    if (params.has("error") || !code) returnUrl.searchParams.set("mcp", "error");
    else
      returnUrl.searchParams.set(
        MCP_OAUTH_RETURN_PARAM,
        encodeMcpOAuthReturn({
          state,
          code,
          ...(params.get("iss") ? { iss: params.get("iss")! } : {}),
        }),
      );
    const destination = new URL(DESKTOP_RETURN_PATH, oauthAppOrigin());
    destination.searchParams.set("next", `${returnUrl.pathname}${returnUrl.search}`);
    return NextResponse.redirect(destination);
  }

  const session = await readForgeCallbackSession(request);
  try {
    if (!session.userId || params.has("error"))
      throw new Error("OAuth authorization canceled");
    await completeMcpOAuth(
      session.userId,
      state,
      code,
      params.get("iss") ?? undefined,
    );
    returnUrl.searchParams.set("mcp", "connected");
  } catch {
    returnUrl.searchParams.set("mcp", "error");
  }
  return session.applyCookies(NextResponse.redirect(returnUrl));
}
