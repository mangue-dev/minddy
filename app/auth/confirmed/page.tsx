import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, CardContent } from "mangue-ui";
import { CheckCircle2 } from "lucide-react";
import { MinddyLogo } from "@/components/minddy-logo";
import { appPageMetadata } from "@/lib/app-metadata";

/**
 * Atterrissage du lien de confirmation d'email (MIN-117).
 *
 * C'est `next=/auth/confirmed`, posé par le template GoTrue, qui amène ici : le
 * jeton a déjà été vérifié (`verifyOtp`) et la session posée sur CE navigateur
 * — depuis MIN-345 par `/auth/confirm/complete`, au bout d'une confirmation
 * explicite, et non plus par la navigation elle-même. D'où le bouton unique
 * vers `/login`, correct dans les deux
 * cas — l'appareil qui vient de valider y trouve une session et bascule sur
 * `/home` ; un autre navigateur y trouve le formulaire de connexion.
 *
 * Page volontairement hors de `app/(auth)/` : elle n'utilise aucun hook d'auth,
 * donc rien à faire de l'`AuthProvider` de ce segment. Le préfixe `/auth/` est
 * déjà public dans `proxy.ts`.
 */

export async function generateMetadata(): Promise<Metadata> {
  return {
    // Le noindex vient de `app/(app)/layout.tsx` pour l'app interne ; cette page
    // vit ailleurs, elle le pose donc elle-même.
    ...(await appPageMetadata("emailConfirmed")),
    robots: { index: false, follow: false },
  };
}

export default async function EmailConfirmedPage() {
  const t = await getTranslations("Auth");

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md rounded-2xl">
        <CardContent className="flex flex-col items-center gap-6 px-8 py-10 text-center">
          <MinddyLogo className="h-7 w-auto text-foreground" />

          <CheckCircle2
            className="size-10 text-emerald-500"
            strokeWidth={1.5}
            aria-hidden="true"
          />

          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              {t("emailConfirmedTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("emailConfirmedBody")}</p>
          </div>

          <Button asChild className="h-10 w-full justify-center">
            <Link href="/login">{t("emailConfirmedCta")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
