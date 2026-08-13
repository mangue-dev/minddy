import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { DESKTOP_CALLBACK_FLAG } from "@/lib/desktop/config";
import {
  buildDesktopAuthUrl,
  desktopAuthLinkFromCallback,
  parseOtpType,
} from "@/lib/desktop/auth-link";
import { captureServerEvent, identifyServerUser } from "@/lib/server/posthog";
import { attachPendingInvitations } from "@/lib/server/members";

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
 * L'alerte push « nouvel utilisateur » (MIN-92), elle, ne part PLUS d'ici : ce
 * callback ne voit que les comptes dont quelqu'un a ouvert le lien, et une
 * inscription par email ne le traverse jamais avant. Elle part désormais du
 * webhook `auth.users` (MIN-117). Les événements PostHog restent, eux : ils
 * datent la première SESSION, pas la création du compte.
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
}

/**
 * Les invitations laissées en attente sur cette adresse deviennent les siennes
 * (MIN-197). C'est le point de rattachement PRINCIPAL : celui où minddy tient un
 * email VÉRIFIÉ par Supabase — et c'est cet email, jamais le `?invite=` du lien,
 * qui décide de qui hérite de quoi. Le rattrapage des sessions qui ne passent
 * pas par ici vit dans `claimPendingInvitationsLate`.
 *
 * **Attendu avant la redirection**, et non différé comme le reste du travail de
 * fond. La séquence est serrée : on redirige vers /home, qui demande aussitôt
 * ses invitations — et cette lecture filtre sur `invited_user_id`, que seul ce
 * rattachement pose. Différé, il courait contre le premier chargement, et le
 * perdre donne le pire accueil possible : quelqu'un qui vient de s'inscrire pour
 * rejoindre une équipe atterrit sur « créez votre premier projet », sans un mot
 * du projet qui l'a fait venir.
 *
 * Le coût est une attente, pas une requête de plus : elle avait déjà lieu, elle
 * se paie juste avant la réponse. Les notifications push, elles, restent
 * différées — `attachPendingInvitations` les passe à `afterOrNow`.
 *
 * Best-effort : une panne ici ne doit pas coûter la session qu'on vient
 * d'établir. Le rattachement se rejouera au prochain passage.
 */
async function claimInvitations(user: User | null): Promise<void> {
  if (!user) return;
  try {
    await attachPendingInvitations(user);
  } catch (err) {
    console.error("[auth/callback] claim invitations failed:", err);
  }
}

/**
 * Exchanges the auth code (OAuth) or email OTP (confirmation / magic link) for a
 * session, writing the session cookies, then redirects to `next` (default /home).
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
   * n'existe pas encore de notre point de vue quand on redirige, donc ni
   * `onAuthArrival` ni `claimInvitations` ne peuvent tourner. Le rattachement
   * des invitations est repris par `claimPendingInvitationsLate`, que /home
   * déclenche à sa première lecture (app/api/projects/invitations) — c'est
   * exactement le filet prévu pour les sessions qui ne passent pas par ici. Les
   * événements PostHog de connexion, eux, sont bel et bien perdus sur ce
   * chemin ; l'`identify` client, lui, part comme d'habitude.
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
      await claimInvitations(data.user);
    } else if (tokenHash && otpType) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (error) {
        console.error("[auth/callback] verifyOtp failed:", error.message);
        // Un lien de confirmation d'inscription mérite mieux que « ce lien de
        // connexion n'est plus valide » : il est à usage unique et peut avoir
        // été consommé par l'antivirus de messagerie du destinataire, qui
        // pré-visite les liens. Le message dédié dit quoi faire (MIN-117).
        return buildFailureRedirect(
          origin,
          "verify_failed",
          otpType === "signup" ? "confirmation_failed" : "auth_callback_failed"
        );
      }
      onAuthArrival(data.user, otpType === "signup" ? "email_confirmation" : "otp");
      await claimInvitations(data.user);
    }

    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error("[auth/callback] unexpected error:", err);
    return buildFailureRedirect(origin, "unexpected");
  }
}
