"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "mangue-ui/components/ui/button";
import { readConsent, writeConsent, type CookieConsent } from "@/lib/cookie-consent";
import { useAnalytics } from "@/lib/use-analytics";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/**
 * Bandeau de consentement aux cookies analytiques. Ne s'affiche que tant
 * qu'aucun choix n'a été fait, et jamais côté serveur (le localStorage n'est lu
 * qu'après montage, sinon le HTML pré-rendu afficherait le bandeau à tout le
 * monde le temps de l'hydratation).
 */
export function CookieBanner() {
  const t = useTranslations("CookieBanner");
  const locale = useLocale() as Locale;
  const { track } = useAnalytics();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(readConsent() === null);
  }, []);

  const choose = (consent: CookieConsent) => {
    // Tracké AVANT `writeConsent` : sur un refus, celui-ci déclenche
    // `opt_out_capturing()` et l'événement ne partirait plus. Il est donc émis
    // dans le mode pré-choix — anonyme et sans écriture sur l'appareil — ce qui
    // permet de connaître le taux de refus sans rien conserver de la personne
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
      className="fixed inset-x-4 bottom-4 z-50 md:left-auto md:right-6 md:max-w-sm"
    >
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-lg">
        <p className="text-sm font-semibold text-card-foreground">{t("title")}</p>
        <p className="text-xs text-muted-foreground">
          {t("description")}{" "}
          <Link
            href={localizedHref("/cookies", locale)}
            className="underline underline-offset-4 hover:text-foreground"
          >
            {t("learnMore")}
          </Link>
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
