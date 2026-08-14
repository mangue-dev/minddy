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

/**
 * Exchanges the auth code (OAuth) for a session, writing the session cookies,
 * then redirects to `next` (default /home).
 *
 * ## Ce qu'il ne fait PLUS : ouvrir une session sur le jeton d'un lien e-mail
 *
 * `GET /auth/callback?token_hash=…&type=magiclink` connectait le navigateur
 * (MIN-345). Une navigation, un jeton, et la session était là — sans que rien
 * ne prouve que la personne devant l'écran ait demandé CE tour. Un attaquant
 * demande un lien pour SON compte, l'envoie à sa victime, et tout ce qu'elle
 * écrit ensuite, elle l'écrit chez lui.
 *
 * Le jeton est donc mis en attente dans un cookie et la personne est envoyée à
 * `/auth/confirm`, qui demande. Le détail du pourquoi — et pourquoi ce n'est
 * pas un nonce dans le lien — est dans `lib/auth-otp-pending.ts`.
 *
 * Le chemin OAuth, lui, garde sa navigation directe : le vérificateur PKCE est
 * un cookie posé au DÉPART du tour, dans ce navigateur-ci, et
 * `exchangeCodeForSession` échoue sans lui. Le tour y est déjà lié à son
 * initiateur, par une preuve plus forte que tout ce qu'on ajouterait.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = new URL(request.url).origin;

  /**
   * Le tour vient de l'app de bureau (MIN-291) : on ne pose PAS de session ici.
   *
   * Le navigateur qui arrive sur cette route est le navigateur SYSTÈME — poser
   * un cookie l'authentifierait *lui*, et laisserait l'app dehors. Le
   * vérificateur PKCE, lui, est resté dans le stockage de l'app, qui a démarré
   * le tour : elle seule peut échanger ce code. On lui repasse donc la main par
   * le deep link, sans rien consommer (le `token_hash` d'un lien mail y compris
   * — il reste à usage unique, c'est simplement l'app qui l'usera).
   *
   * Le marqueur est dans l'URL parce qu'il ne peut pas être ailleurs : l'user
   * agent d'ici est celui de Safari ou de Chrome, jamais celui de la fenêtre.
   *
   * Ce que cette branche NE FAIT PAS, et qui est traité ailleurs : le compte
   * n'existe pas encore de notre point de vue quand on redirige, donc
   * `completeAuthArrival` ne peut pas tourner. Le rattachement des invitations
   * est repris par `claimPendingInvitationsLate`, que /home déclenche à sa
   * première lecture (app/api/projects/invitations) — c'est exactement le filet
   * prévu pour les sessions qui ne passent pas par ici. Les événements PostHog
   * de connexion, eux, sont bel et bien perdus sur ce chemin ; l'`identify`
   * client, lui, part comme d'habitude.
   *
   * Ce lien-là est lié à son tour côté APP, pas ici : le `turn` posé par
   * `signInWithOAuth` traverse le provider et revient dans le deep link, où la
   * fenêtre le compare à celui qu'elle a gardé (MIN-345).
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

  // Le provider (ou GoTrue) a refusé : il rebondit ici avec `error` en query —
  // jamais de `code`. Distinguer le refus de consentement, qui n'est pas une
  // panne, du reste (provider désactivé, redirect_uri non allowlistée…).
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

  // Lien e-mail : rien n'est consommé ici. Le jeton attend dans un cookie
  // `httpOnly`, et `/auth/confirm` demande à qui de droit avant d'ouvrir quoi
  // que ce soit. Le jeton ne reste PAS dans l'URL de l'interstitiel — inutile
  // de le promener une fois de plus, dans un `Referer` cette fois.
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
