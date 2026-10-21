"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AuthColumn, useInDesktopApp } from "@/components/auth/auth-chrome";
import { signupHref } from "@/lib/env";

/**
 * `/signup` on preview (MIN-766). Supabase Auth refuses every sign-up there
 * (`disable_signup`), so the wizard would only fail at its last step. The
 * screen says so up front and points to the production sign-up; existing
 * test accounts keep their way to the login screen.
 */
export function SignupClosed() {
  const t = useTranslations("PreviewEnvironment");
  const inDesktopApp = useInDesktopApp();
  return (
    <AuthColumn inDesktopApp={inDesktopApp}>
      <div className="space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("signupClosedTitle")}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("signupClosedBody")}
          </p>
        </div>
        <Button asChild className="h-10 w-full justify-center">
          <a href={signupHref()}>{t("signupClosedCta")}</a>
        </Button>
        <p className="text-sm text-muted-foreground">
          {t.rich("signupClosedSignIn", {
            link: (chunks) => (
              <Link
                href="/login"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </AuthColumn>
  );
}
