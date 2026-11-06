import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { completeMcpOAuth } from "@/lib/server/mcp-oauth";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
export const maxDuration = 60;

/**
 * Redeems the provider's answer that the OAuth callback handed back to the
 * desktop app (MIN-912). Body `{ state, code, iss? }`.
 *
 * The exchange is bound to the caller's session: `completeMcpOAuth` consumes
 * only an attempt this account started, so an answer from someone else's
 * flow is refused before any code reaches the provider.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const limited = rateLimitRefusal(auth.user.id, "mcp-oauth", { limit: 10 });
  if (limited) return limited;
  let body: { state?: unknown; code?: unknown; iss?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (typeof body?.state !== "string" || typeof body.code !== "string")
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await completeMcpOAuth(
      auth.user.id,
      body.state,
      body.code,
      typeof body.iss === "string" ? body.iss : undefined,
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "oauth" }, { status: 400 });
  }
}
