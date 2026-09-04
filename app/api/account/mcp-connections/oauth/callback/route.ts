import { NextResponse, type NextRequest } from "next/server";
import { readForgeCallbackSession } from "@/lib/server/git/callback-session";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { completeMcpOAuth } from "@/lib/server/mcp-oauth";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const session = await readForgeCallbackSession(request);
  const returnUrl = new URL("/settings", canonicalAppOrigin());
  returnUrl.searchParams.set("tab", "mcp");
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
  return session.applyCookies(NextResponse.redirect(returnUrl));
}
