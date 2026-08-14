import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Button, Card, CardContent } from "mangue-ui";
import { ShieldCheck } from "lucide-react";
import { MinddyLogo } from "@/components/minddy-logo";
import { appPageMetadata } from "@/lib/app-metadata";
import { AUTH_PENDING_COOKIE, decodePendingOtp } from "@/lib/auth-otp-pending";

/**
 * Le pas qui manquait entre un lien reçu et une session ouverte (MIN-345).
 *
 * `/auth/callback` ne consomme plus le jeton d'un lien e-mail : il le met en
 * attente dans un cookie et amène ici. Cette page ne fait qu'une chose, et
 * c'est tout son objet : obtenir un GESTE. Une navigation `GET` arrive de
 * n'importe où — d'un lien reçu, d'une image, d'une redirection — et ne prouve
 * rien ; un `POST` parti de cette page, avec un cookie `SameSite=Lax` qu'aucun
 * autre site ne peut faire voyager, prouve que quelqu'un a lu et cliqué.
 *
 * Le jeton n'est ni dans l'URL ni dans le formulaire : il est resté dans le
 * cookie `httpOnly`, que seul le serveur relit. Le bouton n'a donc rien à
 * porter, et l'écran n'a rien à fuiter dans un `Referer`.
 *
 * Page hors de `app/(auth)/` comme sa voisine `/auth/confirmed` : aucun hook
 * d'auth, donc rien à faire de l'`AuthProvider` de ce segment.
 */

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await appPageMetadata("confirmSignIn")),
    robots: { index: false, follow: false },
  };
}

export default async function ConfirmSignInPage() {
  const t = await getTranslations("Auth");
  const pending = decodePendingOtp((await cookies()).get(AUTH_PENDING_COOKIE)?.value);

  // Un lien de réinitialisation demande le même GESTE, mais ne promet pas la
  // même chose (MIN-297) : « Me connecter » sous un mail intitulé « Réinitialiser
  // votre mot de passe » ferait douter de la page au moment précis où l'on
  // demande de faire confiance.
  const recovery = pending?.type === "recovery";
  const title = recovery ? "confirmResetTitle" : "confirmSignInTitle";
  const body = recovery ? "confirmResetBody" : "confirmSignInBody";
  const cta = recovery ? "confirmResetCta" : "confirmSignInCta";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md rounded-2xl">
        <CardContent className="flex flex-col items-center gap-6 px-8 py-10 text-center">
          <MinddyLogo className="h-7 w-auto text-foreground" />

          <ShieldCheck
            className="size-10 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />

          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              {pending ? t(title) : t("confirmSignInExpiredTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {pending ? t(body) : t("confirmSignInExpiredBody")}
            </p>
          </div>

          {pending ? (
            // Formulaire natif, pas de fetch : la réponse est une redirection
            // que le navigateur suit, et les cookies de session qu'elle porte
            // se posent sans qu'aucun script n'ait à exister.
            <form action="/auth/confirm/complete" method="post" className="w-full">
              <Button type="submit" className="h-10 w-full justify-center">
                {t(cta)}
              </Button>
            </form>
          ) : (
            <Button asChild className="h-10 w-full justify-center">
              <Link href="/login">{t("confirmSignInExpiredCta")}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
