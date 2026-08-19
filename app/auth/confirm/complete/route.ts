import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_PENDING_COOKIE,
  authPendingCookieOptions,
  decodePendingOtp,
} from "@/lib/auth-otp-pending";
import { isSameOriginRequest } from "@/lib/server/same-origin";
import { buildAuthFailureRedirect, completeAuthArrival } from "@/lib/server/auth-arrival";
import { SESSION_COOKIE_OPTIONS } from "@/lib/session-cookies";

/**
 * The gesture that opens the session, at the end of the e-mail link (MIN-345).
 *
 * Three things must be true to get to the end, and each one covers this
 * that the others do not cover:
 *
 * 1. **It's a `POST`.** A `GET` navigation is obtained by clicking on
 * a link ; that was exactly the flaw.
 * 2. **The wait cookie is there.** It is `SameSite=Lax`, so a `POST` gone
 * from another site does not win: an attacker's self-submitted form
 * arrives empty-handed, and there is nothing to consume.
 * 3. **The `Origin` is ours.** The belt from the previous strap, for the
 * day when a browser releases `SameSite` or an extension gets involved.
 *
 * Redirection in **303**: the browser must restart in `GET` on the
 * destination. The default 307 of `NextResponse.redirect` would replay the
 * `POST` on `/home`, who doesn't want it.
 */
export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;

  if (!isSameOriginRequest(request)) {
    return NextResponse.redirect(`${origin}/login`, 303);
  }

  const cookieStore = await cookies();
  const pending = decodePendingOtp(cookieStore.get(AUTH_PENDING_COOKIE)?.value);
  if (!pending) {
    return NextResponse.redirect(`${origin}/auth/confirm`, 303);
  }

  const supabase = createServerClient(
    process.env.MINDDY_PUBLIC_SUPABASE_URL!,
    process.env.MINDDY_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // `Secure` on session cookies (MIN-351, lib/session-cookies.ts):
      // this is where the session opens after an e-mail link.
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

  // The token leaves the browser whatever happens next: successful it is
  // consumed, missed it is no longer worth anything. Leaving it lying around would only offer
  // a second chance to whoever gets their hands on it.
  cookieStore.set(AUTH_PENDING_COOKIE, "", authPendingCookieOptions(0));

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: pending.tokenHash,
      type: pending.type,
    });
    if (error) {
      console.error("[auth/confirm] verifyOtp failed:", error.message);
      // A registration confirmation link deserves better than “this link
      // connection is no longer valid”: it is for single use and may have
      // been consumed by the recipient's email antivirus, which
      // pre-visit the links. The dedicated message says what to do (MIN-117).
      return redirect303(
        buildAuthFailureRedirect(
          origin,
          "verify_failed",
          pending.type === "signup" ? "confirmation_failed" : "auth_callback_failed"
        )
      );
    }

    await completeAuthArrival(
      data.user,
      pending.type === "signup" ? "email_confirmation" : "otp"
    );
    return NextResponse.redirect(`${origin}${pending.next}`, 303);
  } catch (err) {
    console.error("[auth/confirm] unexpected error:", err);
    return redirect303(buildAuthFailureRedirect(origin, "unexpected"));
  }
}

/** Same destination, but in 303 — see file header. */
function redirect303(response: NextResponse): NextResponse {
  return NextResponse.redirect(response.headers.get("location") ?? "/login", 303);
}
