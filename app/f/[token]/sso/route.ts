import { NextResponse, type NextRequest } from "next/server";
import { verifyFeedbackSsoJwt } from "@/lib/feedback/sso-jwt";
import { isPrimaryHost, normalizeHost } from "@/lib/public-hosts";
import { feedbackBasePath, getRequestDomainTarget } from "@/lib/server/custom-domains";
import { getBoardByToken } from "@/lib/server/feedback/boards";
import {
  FEEDBACK_SESSION_COOKIE,
  createFeedbackSession,
  feedbackSessionCookieOptions,
  upsertFeedbackUser,
} from "@/lib/server/feedback/identity";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * Atterrissage SSO du board public (MIN-37) : le backend du client signe un
 * JWT HS256 court avec le sso_secret du board et envoie l'utilisateur ici
 * (/f/<token>?sso=<jwt> redirige vers cette route). On vérifie, on upsert
 * l'identité, on pose le cookie de session et on repart vers le board — le
 * JWT ne reste jamais dans l'URL finale.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  // Domaine personnalisé (MIN-36) : les redirects repartent vers l'origin
  // VISIBLE (host + proto forwardé) — sous rewrite, request.url porte le path
  // interne /f/<token>/… qu'il ne faut pas montrer.
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

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const rate = checkSessionRateLimit(ip, `feedback-sso:${token}`, { limit: 20 });
  if (!rate.allowed) return NextResponse.redirect(failureUrl);

  const ctx = await getBoardByToken(token);
  if (!ctx || !ctx.board.enabled || !ctx.board.sso_secret) {
    return NextResponse.redirect(failureUrl);
  }

  const verified = verifyFeedbackSsoJwt(jwt, ctx.board.sso_secret);
  if (!verified.ok) return NextResponse.redirect(failureUrl);

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
