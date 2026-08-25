import { NextResponse, type NextRequest } from "next/server";
import { verifyFeedbackSsoJwt } from "@/lib/feedback/sso-jwt";
import { isPrimaryHost, normalizeHost } from "@/lib/public-hosts";
import { feedbackBasePath, getRequestDomainTarget } from "@/lib/server/custom-domains";
import { getBoardWithSsoSecretByToken } from "@/lib/server/feedback/boards";
import {
  FEEDBACK_SESSION_COOKIE,
  createFeedbackSession,
  feedbackSessionCookieOptions,
  upsertFeedbackUser,
} from "@/lib/server/feedback/identity";
import { consumeSsoToken } from "@/lib/server/feedback/sso-replay";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getClientIp } from "@/lib/server/request-ip";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * SSO landing of the public board (MIN-37): the client backend signs a
 * JWT HS256 runs with the sso_secret of the board and sends the user here
 * (/f/<token>?sso=<jwt> redirects to this route). We check, we consume, we
 * upsert the identity, we set the session cookie and we go back to the board —
 * the JWT never stays in the final URL.
 *
 * “We consume” (MIN-345): the token is only worth one passage. Although he doesn't
 * never stay in the FINAL URL, it crossed this one — so the `Referer`,
 * browser history and log of who was on the path.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  // Custom domain (MIN-36): redirects go back to the origin
  // VISIBLE (host + forwarded proto) — under rewrite, request.url carries the path
  // internal /f/<token>/… path that must not be exposed.
  const host = normalizeHost(request.headers.get("host") ?? request.nextUrl.host);
  const isCustomHost = Boolean(host) && !isPrimaryHost(host);
  const proto =
    request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const origin = `${proto}://${request.headers.get("host") ?? request.nextUrl.host}`;
  const base = feedbackBasePath(token, await getRequestDomainTarget());
  const boardUrl = new URL(base || "/", origin);
  const failureUrl = new URL(`${base || "/"}?ssoError=1`, origin);

  const jwt = request.nextUrl.searchParams.get("jwt");
  if (!jwt) return NextResponse.redirect(failureUrl);

  const rate = checkSessionRateLimit(getClientIp(request), `feedback-sso:${token}`, {
    limit: 20,
  });
  if (!rate.allowed) return NextResponse.redirect(failureUrl);

  const ctx = await getBoardWithSsoSecretByToken(token);
  if (!ctx || !ctx.board.enabled || !ctx.board.sso_secret) {
    return NextResponse.redirect(failureUrl);
  }

  const verified = verifyFeedbackSsoJwt(jwt, ctx.board.sso_secret);
  if (!verified.ok) {
    console.error(`[feedback-sso] rejected jwt on board ${token}: ${verified.error}`);
    return NextResponse.redirect(failureUrl);
  }

  // Single-use (MIN-345): the verified signature only says “this token was
  // issued by the board”, never “it has not already been used”. Consumed BEFORE
  // to open anything — a replay should not even touch identity.
  if (
    !(await consumeSsoToken({
      boardId: ctx.board.id,
      tokenId: verified.tokenId,
      expiresAt: verified.expiresAt,
    }))
  ) {
    return NextResponse.redirect(failureUrl);
  }

  const user = await upsertFeedbackUser({
    projectId: ctx.project.id,
    externalId: verified.claims.externalId,
    email: verified.claims.email,
    name: verified.claims.name,
    verifiedVia: "sso",
  });
  if (!user) return NextResponse.redirect(failureUrl);

  const session = await createFeedbackSession({ boardId: ctx.board.id, userId: user.id });
  if (!session) return NextResponse.redirect(failureUrl);

  const response = NextResponse.redirect(boardUrl);
  response.cookies.set(
    FEEDBACK_SESSION_COOKIE,
    session.token,
    feedbackSessionCookieOptions(token, session.expiresAt, { atRoot: isCustomHost })
  );
  return response;
}
