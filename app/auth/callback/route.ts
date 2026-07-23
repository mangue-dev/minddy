import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";

const EMAIL_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function parseOtpType(value: string | null): EmailOtpType | null {
  return value && EMAIL_OTP_TYPES.has(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

function buildFailureRedirect(
  origin: string,
  reason: string,
  error = "auth_callback_failed"
): NextResponse {
  const url = new URL(`${origin}/login`);
  url.searchParams.set("error", error);
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url.toString());
}

/**
 * Exchanges the auth code (OAuth) or email OTP (confirmation / magic link) for a
 * session, writing the session cookies, then redirects to `next` (default /home).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = new URL(request.url).origin;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = parseOtpType(searchParams.get("type"));
  const next = sanitizeInternalRedirectPath(searchParams.get("next"));

  // Le provider (ou GoTrue) a refusé : il rebondit ici avec `error` en query —
  // jamais de `code`. Distinguer le refus de consentement, qui n'est pas une
  // panne, du reste (provider désactivé, redirect_uri non allowlistée…).
  const providerError = searchParams.get("error");
  if (providerError) {
    const description =
      searchParams.get("error_description") ?? searchParams.get("error_code") ?? "";
    console.error(`[auth/callback] provider error: ${providerError} ${description}`);
    return buildFailureRedirect(
      origin,
      providerError,
      providerError === "access_denied" ? "oauth_denied" : "oauth_failed"
    );
  }

  if (!code && !(tokenHash && otpType)) {
    return buildFailureRedirect(origin, "missing_params");
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
        return buildFailureRedirect(origin, "exchange_failed");
      }
    } else if (tokenHash && otpType) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (error) {
        console.error("[auth/callback] verifyOtp failed:", error.message);
        return buildFailureRedirect(origin, "verify_failed");
      }
    }

    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error("[auth/callback] unexpected error:", err);
    return buildFailureRedirect(origin, "unexpected");
  }
}
