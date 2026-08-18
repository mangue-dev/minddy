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
 * The missing step between a received link and an open session (MIN-345).
 *
 * `/auth/callback` no longer consumes the token of an e-mail link: it puts it in
 * wait in a cookie and bring here. This page only does one thing, and
 * that’s its whole purpose: to obtain a GESTURE. A `GET` navigation arrives from
 * anywhere — from a received link, from an image, from a redirection — and does not prove
 * Nothing ; a `POST` part of this page, with a `SameSite=Lax` cookie that none
 * other site cannot make you travel, proves that someone read and clicked.
 *
 * The token is neither in the URL nor in the form: it remained in the
 * cookie `httpOnly`, which only the server rereads. The button therefore has nothing to
 * wear, and the screen has nothing to leak into a `Referer`.
 *
 * Page outside of `app/(auth)/` like its neighbor `/auth/confirmed`: no hook
 * auth, so nothing to do with the `AuthProvider` of this segment.
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

  // A reset link asks for the same GESTURE, but does not promise
  // same thing (MIN-297): “Connect” under an email titled “Reset
  // your password" would make the page doubtful at the precise moment when we
  // ask the user to trust it.
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
            // Native form, no fetch: response is a redirect
            // that the browser tracks, and the session cookies it carries
            // arise without any script having to exist.
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
