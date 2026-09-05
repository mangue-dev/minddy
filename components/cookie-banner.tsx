"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "mangue-ui/components/ui/button";
import { readConsent, writeConsent, type CookieConsent } from "@/lib/cookie-consent";
import { isDesktop } from "@/lib/desktop/bridge";
import { useAnalytics } from "@/lib/use-analytics";
import { localizedHref } from "@/lib/locale-href";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { CARD_TONES } from "@/components/marketing/card-tones";
import type { Locale } from "@/i18n/config";

/** Show web consent after hydration; desktop consent is managed in account settings. */
export function CookieBanner() {
  const t = useTranslations("CookieBanner");
  const locale = useLocale() as Locale;
  const { track } = useAnalytics();
  const { appUrl } = useRuntimeConfig();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(readConsent() === null && !isDesktop());
  }, []);

  const choose = (consent: CookieConsent) => {
    // Record the anonymous choice before writeConsent applies the analytics preference.
    track("cookie_consent_choice", { choice: consent });
    writeConsent(consent);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      // Keep the card clear of the home indicator on devices with a safe area.
      className="fixed inset-x-4 bottom-4 z-50 pb-[env(safe-area-inset-bottom)] md:left-auto md:right-6 md:max-w-[26rem]"
    >
      <div className={`rounded-2xl border border-current/10 p-6 shadow-xl shadow-black/10 ${CARD_TONES.butter}`}>
        <p className="text-lg font-medium tracking-tight">{t("title")}</p>
        <p className="mt-3 text-[13px] leading-relaxed opacity-85">
          {t("description")}{" "}
          {/* An absolute URL keeps the policy accessible from custom feedback domains. */}
          <a
            href={`${appUrl}${localizedHref("/cookies", locale)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm underline underline-offset-4 hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"
          >
            {t("learnMore")}
          </a>
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button size="lg" variant="outline" className="min-h-11 rounded-lg border-current/20 bg-white/30 text-inherit hover:bg-white/60 dark:bg-black/10 dark:hover:bg-black/20" onClick={() => choose("accepted")}>
            {t("accept")}
          </Button>
          <Button size="lg" variant="outline" className="min-h-11 rounded-lg border-current/20 bg-white/30 text-inherit hover:bg-white/60 dark:bg-black/10 dark:hover:bg-black/20" onClick={() => choose("declined")}>
            {t("decline")}
          </Button>
        </div>
      </div>
    </div>
  );
}
