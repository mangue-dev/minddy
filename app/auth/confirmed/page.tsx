import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, CardContent } from "mangue-ui";
import { CheckCircle2 } from "lucide-react";
import { MinddyLogo } from "@/components/minddy-logo";
import { appPageMetadata } from "@/lib/app-metadata";

/**
 * Landing page for the email confirmation link (MIN-117).
 *
 * It is `next=/auth/confirmed`, set by the GoTrue template, which brings here: the
 * token has already been verified (`verifyOtp`) and the session placed on THIS browser
 * — from MIN-345 by `/auth/confirm/complete`, after confirmation
 * explicitly, and no longer by the navigation itself. Hence the single button
 * to `/login`, correct in both
 * case — the device which has just validated finds a session there and switches to
 * `/home` ; another browser finds the login form there.
 *
 * Page voluntarily outside `app/(auth)/`: it does not use any auth hook,
 * so nothing to do with the `AuthProvider` of this segment. The `/auth/` prefix is
 * already public in `proxy.ts`.
 */

export async function generateMetadata(): Promise<Metadata> {
  return {
    // The noindex comes from `app/(app)/layout.tsx` for the internal app; this page
    // lives elsewhere, so she asks it herself.
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
