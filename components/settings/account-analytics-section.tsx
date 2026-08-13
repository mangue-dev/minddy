"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Switch } from "mangue-ui";
import { BarChart3 } from "lucide-react";
import Link from "next/link";

import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { readConsent, writeConsent } from "@/lib/cookie-consent";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/**
 * La mesure d'audience, sous forme d'interrupteur (MIN-291).
 *
 * Le consentement se recueillait UNIQUEMENT dans le bandeau du bas de page, et
 * une fois répondu il devenait irrévocable faute d'écran pour le rouvrir. Ça se
 * tenait tant que le bandeau était le seul chemin ; ça ne tient plus dès lors
 * que l'app de bureau ne l'affiche pas — sans cet écran, personne ne pourrait
 * plus rien choisir du tout là-bas.
 *
 * Même stockage que le bandeau (`lib/cookie-consent.ts`) : une préférence
 * d'APPAREIL dans le localStorage, jamais une donnée de compte. L'app de bureau
 * a son propre stockage, donc son propre choix — ce qui est le comportement
 * juste : consentir sur le web ne consent pas pour une autre machine.
 *
 * L'état de départ est `false` le temps du montage, comme partout où l'on lit le
 * stockage local : le rendu serveur ne le voit pas, et le supposer ferait
 * diverger l'hydratation.
 */
export function AccountAnalyticsSection() {
  const t = useTranslations("Analytics");
  const locale = useLocale() as Locale;
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setAccepted(readConsent() === "accepted");
  }, []);

  const toggle = (next: boolean) => {
    setAccepted(next);
    // `writeConsent` prévient PostHog dans la foulée (CONSENT_CHANGED_EVENT) :
    // couper ici coupe la mesure tout de suite, sans rechargement.
    writeConsent(next ? "accepted" : "declined");
  };

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountAnalytics}
      icon={BarChart3}
      title={t("title")}
      description={t("description")}
    >
      <SettingsRow
        htmlFor="analytics-consent"
        label={t("enableLabel")}
        hint={t("enableHint")}
        control={
          <Switch
            id="analytics-consent"
            checked={accepted}
            onCheckedChange={toggle}
          />
        }
      >
        <Link
          href={localizedHref("/cookies", locale)}
          className="text-xs underline underline-offset-4 hover:text-foreground"
        >
          {t("learnMore")}
        </Link>
      </SettingsRow>
    </SettingsGroup>
  );
}
