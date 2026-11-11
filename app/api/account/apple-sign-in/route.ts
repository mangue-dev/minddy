import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { saveAppleAuthorization } from "@/lib/server/apple-sign-in";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * POST — keeps the Apple authorization of the calling account, so that
 * deleting the account can revoke it (MIN-907, `lib/server/apple-sign-in.ts`).
 *
 * The body carries one of:
 * - `authorizationCode`: the one-time code from the iOS app's Apple sheet;
 * - `refreshToken`: the token Supabase returned after a web or desktop round.
 *
 * The account must have Apple among its sign-in methods. Apple checks the
 * grant itself before anything is stored, so a value from elsewhere is
 * refused rather than kept.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const rate = checkSessionRateLimit(auth.user.id, "account:apple-sign-in", { limit: 10 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const providers = (auth.user.app_metadata as { providers?: unknown } | undefined)?.providers;
  if (!Array.isArray(providers) || !providers.includes("apple")) {
    return NextResponse.json({ error: "Not an Apple account" }, { status: 400 });
  }

  let body: { authorizationCode?: unknown; refreshToken?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const isGrant = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0 && value.length <= 2048;
  const grant = isGrant(body.authorizationCode)
    ? { client: "ios" as const, grant: { authorizationCode: body.authorizationCode } }
    : isGrant(body.refreshToken)
      ? { client: "web" as const, grant: { refreshToken: body.refreshToken } }
      : null;
  if (!grant) return NextResponse.json({ error: "Invalid grant" }, { status: 400 });

  try {
    const saved = await saveAppleAuthorization(auth.user.id, grant.client, grant.grant);
    return saved
      ? NextResponse.json({ saved: true })
      : NextResponse.json({ error: "Apple authorization refused" }, { status: 422 });
  } catch {
    console.error("[api/apple-sign-in] save_failed");
    return NextResponse.json({ error: "Apple authorization not saved" }, { status: 500 });
  }
}
