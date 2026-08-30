"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "mangue-ui/components/ui/button";
import { readConsent, writeConsent, type CookieConsent } from "@/lib/cookie-consent";
import { isDesktop } from "@/lib/desktop/bridge";
import { useAnalytics } from "@/lib/use-analytics";
import { localizedHref } from "@/lib/locale-href";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import type { Locale } from "@/i18n/config";

/**
 * Bandeau de consentement aux cookies analytiques. Ne s'affiche que tant
 * that no choice was made, and never on the server side (the localStorage is not read
 * only after editing, otherwise the pre-rendered HTML would display the banner at all times.
 * world the time of hydration).
 *
 * ## And never in the desktop app (MIN-291)
 *
 * A floating card that requests permission to measure is an object of
 * SITE: it is aimed at someone who has just arrived from nowhere and to whom
 * we need information before writing anything to him. In an app that we have
 * downloaded, signed, installed and opened, she no longer has anyone to inform
 * that way — it just says “this is a website in a
 * window ".
 *
 * What doesn't go away is CHOICE. It moves to the settings
 * (components/settings/account-analytics-section.tsx), where any desktop app
 * puts, and it is reversible - which it was not until now, once the
 * headband replied. Until it is given, consent is worth `null` and
 * PostHog remains without cookies or identity, exactly as for a visitor to the
 * web which has not yet decided: **nothing is measured quietly**. There
 * consideration is real and assumed — the audience measurement is extinguished by
 * default on the desktop app.
 */
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
    // Tracked BEFORE `writeConsent`: upon refusal, this triggers
    // `opt_out_capturing()` and the event would no longer run. It is therefore issued
    // in pre-choice mode — anonymous and without writing to the device — which
    // allows you to know the refusal rate without keeping anything about the person
    // qui refuse.
    track("cookie_consent_choice", { choice: consent });
    writeConsent(consent);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      // Bottom padding: the page is fully bleed since the root layout
      // declares `viewport-fit=cover`, so `bottom-4` now counts from the
      // PHYSICAL edge — 16 px, less than the home indicator bar.
      // The padding raises the card above it, like the Numo FAB.
      //
      // Do NOT abbreviate an arbitrary-valued utility with points
      // suspension in a comment: Tailwind scans the entire file,
      // comments included, and generates a rule with the points in it —
      // which does not compile. We write the entire class, or not at all.
      className="fixed inset-x-4 bottom-4 z-50 pb-[env(safe-area-inset-bottom)] md:left-auto md:right-6 md:max-w-sm"
    >
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-lg">
        <p className="text-sm font-semibold text-card-foreground">{t("title")}</p>
        <p className="text-xs text-muted-foreground">
          {t("description")}{" "}
          {/* ABSOLUTE URL, and a <a> tag rather than a <Link>: this banner is
 mounted by the root layout, therefore also on a feedback board served
 from the domain of its publisher (MIN-36). There, the proxy rewrites
 everything it does not recognize to /f/<token>/…: a relative `/cookies`
 was sent to 404, and consent was collected without the person being able to read what they were consenting to. Same fix as the
 board information mention (app/f/[token]/feedback-auth.tsx). */}
          <a
            href={`${appUrl}${localizedHref("/cookies", locale)}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            {t("learnMore")}
          </a>
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => choose("accepted")}>
            {t("accept")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => choose("declined")}>
            {t("decline")}
          </Button>
        </div>
      </div>
    </div>
  );
}
