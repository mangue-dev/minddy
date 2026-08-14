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
 * Le geste qui ouvre la session, au bout du lien e-mail (MIN-345).
 *
 * Trois choses doivent être vraies pour arriver au bout, et chacune couvre ce
 * que les autres ne couvrent pas :
 *
 * 1. **C'est un `POST`.** Une navigation `GET` s'obtient en faisant cliquer sur
 *    un lien ; c'était exactement la faille.
 * 2. **Le cookie d'attente est là.** Il est `SameSite=Lax`, donc un `POST` parti
 *    d'un autre site ne l'emporte pas : le formulaire auto-soumis d'un attaquant
 *    arrive les mains vides, et il n'y a rien à consommer.
 * 3. **L'`Origin` est la nôtre.** La ceinture de la bretelle précédente, pour le
 *    jour où un navigateur relâche `SameSite` ou une extension s'en mêle.
 *
 * Redirection en **303** : le navigateur doit repartir en `GET` sur la
 * destination. Le 307 par défaut de `NextResponse.redirect` rejouerait le
 * `POST` sur `/home`, qui n'en veut pas.
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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // `Secure` sur les cookies de session (MIN-351, lib/session-cookies.ts) :
      // c'est ici que la session s'ouvre au bout d'un lien e-mail.
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

  // Le jeton part du navigateur quoi qu'il advienne ensuite : réussi il est
  // consommé, raté il ne vaut plus rien. Le laisser traîner ne ferait qu'offrir
  // une seconde chance à qui a mis la main dessus.
  cookieStore.set(AUTH_PENDING_COOKIE, "", authPendingCookieOptions(0));

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: pending.tokenHash,
      type: pending.type,
    });
    if (error) {
      console.error("[auth/confirm] verifyOtp failed:", error.message);
      // Un lien de confirmation d'inscription mérite mieux que « ce lien de
      // connexion n'est plus valide » : il est à usage unique et peut avoir
      // été consommé par l'antivirus de messagerie du destinataire, qui
      // pré-visite les liens. Le message dédié dit quoi faire (MIN-117).
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

/** Même destination, mais en 303 — voir l'en-tête du fichier. */
function redirect303(response: NextResponse): NextResponse {
  return NextResponse.redirect(response.headers.get("location") ?? "/login", 303);
}
