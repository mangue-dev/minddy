import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import {
  AUTH_PENDING_COOKIE,
  authPendingCookieOptions,
  encodePendingOtp,
} from "@/lib/auth-otp-pending";
import { DESKTOP_CALLBACK_FLAG } from "@/lib/desktop/config";
import {
  buildDesktopAuthUrl,
  desktopAuthLinkFromCallback,
  parseOtpType,
} from "@/lib/desktop/auth-link";
import { buildAuthFailureRedirect, completeAuthArrival } from "@/lib/server/auth-arrival";
import { SESSION_COOKIE_OPTIONS } from "@/lib/session-cookies";

/**
 * Exchanges the auth code (OAuth) for a session, writing the session cookies,
 * then redirects to `next` (default /home).
 *
 * ## What it NO LONGER does: log in to an email link token
 *
 * `GET /auth/callback?token_hash=…&type=magiclink` connected the browser
 * (MIN-345). A navigation, a token, and the session was there — without anything
 * only proves that the person in front of the screen requested THIS trick. An attacker
 * asks for a link for HIS account, sends it to his victim, and everything she
 * then writes, she writes it at his house.
 *
 * The token is therefore queued in a cookie and the person is sent to
 * `/auth/confirm`, which asks. The details of why — and why it's not
 * not a nonce in the link — is in `lib/auth-otp-pending.ts`.
 *
 * The OAuth path keeps its direct navigation: the PKCE verifier is
 * a cookie placed at the START of the tour, in this browser, and
 * `exchangeCodeForSession` fails without it. The turn is already linked to its
 * initiator, by a proof stronger than anything that could be added.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = new URL(request.url).origin;

  /**
   * The turn comes from the desktop app (MIN-291): we do NOT set a session here.
   *
   * The navigator that arrives on this route is the SYSTEM navigator — ask
   * a cookie would authenticate *him*, and leave the app out. THE
   * PKCE verifier remained in the storage of the app, which started
   * the trick: only she can exchange this code. So we hand him over
   * the deep link, without consuming anything (the `token_hash` of an email link including
   * — it remains for single use, it is simply the app that will use it).
   *
   * The marker is in the URL because it can't be anywhere else: the user
   * agent here is that of Safari or Chrome, never that of the window.
   *
   * What this branch DOES NOT do, and which is covered elsewhere: the account
   * does not yet exist from our point of view when we redirect, so
   * `completeAuthArrival` cannot rotate. Attaching invitations
   * is taken over by `claimPendingInvitationsLate`, which /home triggers when
   * first read (app/api/projects/invitations) — this is exactly the net
   * intended for sessions that do not pass through here. PostHog events
   * of connection, they are indeed lost on this path; the `identify`
   * client continues as usual.
   *
   * This link is linked in turn on the APP side, not here: the `turn` set by
   * `signInWithOAuth` passes through the provider and returns to the deep link, where the
   * window compares it to the one she kept (MIN-345).
   */
  if (searchParams.get(DESKTOP_CALLBACK_FLAG) === "1") {
    return NextResponse.redirect(
      buildDesktopAuthUrl(desktopAuthLinkFromCallback(searchParams))
    );
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = parseOtpType(searchParams.get("type"));
  const next = sanitizeInternalRedirectPath(searchParams.get("next"));

  // The provider (or GoTrue) refused: it bounces here with `error` in query —
  // never `code`. Distinguish between refusal of consent, which is not a
  // failure, moreover (provider disabled, redirect_uri not allowed listed, etc.).
  const providerError = searchParams.get("error");
  if (providerError) {
    const description =
      searchParams.get("error_description") ?? searchParams.get("error_code") ?? "";
    console.error(`[auth/callback] provider error: ${providerError} ${description}`);
    return buildAuthFailureRedirect(
      origin,
      providerError,
      providerError === "access_denied" ? "oauth_denied" : "oauth_failed"
    );
  }

  // Email link: Nothing is consumed here. The token waits in a cookie
  // `httpOnly`, and `/auth/confirm` asks who it may concern before opening what
  // whatever. Token does NOT stay in interstitial URL — useless
  // to walk him once more, in a `Referer` this time.
  if (!code && tokenHash && otpType) {
    const response = NextResponse.redirect(`${origin}/auth/confirm`);
    response.cookies.set(
      AUTH_PENDING_COOKIE,
      encodePendingOtp({ tokenHash, type: otpType, next }),
      authPendingCookieOptions()
    );
    return response;
  }

  if (!code) {
    return buildAuthFailureRedirect(origin, "missing_params");
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // `Secure` on session cookies: the package does not set it
      // (MIN-351, lib/session-cookies.ts). Here as in `cookieOptions` —
      // it is this adapter that writes, and it receives its options from the client.
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS })
          );
        },
      },
    }
  );

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
      return buildAuthFailureRedirect(origin, "exchange_failed");
    }
    await completeAuthArrival(data.user, "oauth");

    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error("[auth/callback] unexpected error:", err);
    return buildAuthFailureRedirect(origin, "unexpected");
  }
}
