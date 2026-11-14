"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { readConsent, writeConsent, type CookieConsent } from "@/lib/cookie-consent";
import { isNativeApp } from "@/lib/native-app";
import { useAnalytics } from "@/lib/use-analytics";
import { localizedHref } from "@/lib/locale-href";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";

/**
 * Show web consent after hydration, as a small card in the bottom corner
 * that does not block the page. The installed apps, desktop and mobile,
 * ask the same question once in a dialog after sign-in
 * (`desktop-analytics-prompt.tsx`): a banner pinned to the bottom of the page
 * belongs to a site, not to an app.
 */
export function CookieBanner() {
  const t = useTranslations("CookieBanner");
  const locale = useLocale() as Locale;
  const { track } = useAnalytics();
  const { appUrl, capabilities } = useRuntimeConfig();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(readConsent() === null && !isNativeApp());
  }, []);

  const choose = (consent: CookieConsent) => {
    // Record the anonymous choice before writeConsent applies the analytics preference.
    track("cookie_consent_choice", { choice: consent });
    writeConsent(consent);
    setVisible(false);
  };

  if (!visible || !capabilities.analytics?.configured) return null;

  return (
    <section
      aria-label={t("title")}
      // Non-blocking: a small card in the corner, the page stays usable behind
      // it. In the app on a phone it sits above the navigation bar; the bottom
      // inset keeps it clear of the home indicator.
      data-floating-surface
      className={cn(
        "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg",
        "sm:inset-x-auto sm:left-4 sm:bottom-4 sm:w-[22rem]",
        "[html[data-app-shell][data-app-layout=mobile]_&]:bottom-[var(--mobile-nav-clearance)]",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none",
      )}
    >
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {t("description")}{" "}
        {/* An absolute URL keeps the policy accessible from custom feedback domains. */}
        <a
          href={`${appUrl}${localizedHref("/cookies", locale)}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm text-foreground underline underline-offset-4 hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("learnMore")}
        </a>
      </p>
      {/* Both answers weigh the same: declining is as easy as accepting. */}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 max-sm:h-10" onClick={() => choose("declined")}>
          {t("decline")}
        </Button>
        <Button size="sm" variant="outline" className="flex-1 max-sm:h-10" onClick={() => choose("accepted")}>
          {t("accept")}
        </Button>
      </div>
    </section>
  );
}
