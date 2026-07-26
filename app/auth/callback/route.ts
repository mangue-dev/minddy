import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { notifyNewUser } from "@/lib/server/brrr";
import { captureServerEvent, identifyServerUser } from "@/lib/server/posthog";

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
 * Inscription ou connexion ? (MIN-78)
 *
 * C'est ICI que la question se tranche, et nulle part ailleurs : le serveur voit
 * `created_at` et `last_sign_in_at` du compte au moment exact de l'échange.
 * Un écart de quelques secondes entre les deux = première connexion. AutoKap
 * avait tenté l'heuristique côté client (« compte créé il y a moins d'une
 * minute »), qui étiquetait mal les premières connexions différées et
 * double-comptait avec l'événement serveur — d'où ce choix.
 *
 * Ces événements partent quel que soit le consentement cookies : aucun cookie
 * n'est posé de ce fait, et le `distinctId` est l'id du compte, que
 * l'utilisateur nous confie déjà en créant ce compte.
 *
 * C'est aussi d'ici que part l'alerte push « nouvel utilisateur » (MIN-92) :
 * même signal, deux destinations — PostHog pour le compte, le téléphone pour
 * l'événement.
 */
function onAuthArrival(
  user: User | null,
  channel: "oauth" | "email_confirmation" | "otp"
): void {
  if (!user) return;
  const provider = user.app_metadata?.provider ?? "email";
  const createdAt = user.created_at ? Date.parse(user.created_at) : Number.NaN;
  const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : Number.NaN;
  // Première connexion : la session en cours est la toute première du compte.
  const isFirstSignIn =
    !Number.isNaN(createdAt) &&
    (Number.isNaN(lastSignIn) || Math.abs(lastSignIn - createdAt) < 10_000);

  identifyServerUser(user.id, { signup_method: provider });

  if (channel === "email_confirmation") {
    captureServerEvent({
      distinctId: user.id,
      event: "signup_email_confirmed",
      properties: { method: provider },
    });
  }

  captureServerEvent({
    distinctId: user.id,
    event: isFirstSignIn ? "user_signed_up" : "user_signed_in",
    properties: { method: provider, channel },
  });

  // Le compte vient d'être créé → vibration. Attention, ce n'est pas exactement
  // `isFirstSignIn` : un lien de confirmation cliqué dix minutes après le
  // formulaire sort de la fenêtre de 10 s, et reste pourtant une inscription —
  // c'est même le chemin normal, l'instance Supabase exige la confirmation.
  if (isFirstSignIn || channel === "email_confirmation") {
    notifyNewUser(user);
  }
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
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
        return buildFailureRedirect(origin, "exchange_failed");
      }
      onAuthArrival(data.user, "oauth");
    } else if (tokenHash && otpType) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (error) {
        console.error("[auth/callback] verifyOtp failed:", error.message);
        return buildFailureRedirect(origin, "verify_failed");
      }
      onAuthArrival(data.user, otpType === "signup" ? "email_confirmation" : "otp");
    }

    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error("[auth/callback] unexpected error:", err);
    return buildFailureRedirect(origin, "unexpected");
  }
}
