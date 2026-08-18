"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Switch } from "mangue-ui";
import { BarChart3 } from "lucide-react";
import Link from "next/link";

import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { useAuth } from "@/lib/auth-context";
import {
  ANALYTICS_CONSENT_META_KEY,
  readConsent,
  resolveAnalyticsConsent,
  writeConsent,
} from "@/lib/cookie-consent";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/**
 * Audience measurement, in the form of a switch (MIN-291).
 *
 * Consent was collected ONLY in the banner at the bottom of the page, and
 * once answered it became irrevocable due to lack of screen to reopen it. It happens
 * held on as long as the blindfold was the only way; it no longer holds
 * that the desktop app doesn't display it — without this screen, no one would be able to
 * nothing to choose from at all there.
 *
 * Same storage as the banner (`lib/cookie-consent.ts`): localStorage
 * decides the MEASUREMENT on this device, and he alone — consent on the web does not
 * put nothing on another machine.
 *
 * What is added to it (MIN-293): the choice is copied into the account, which decides
 * of the QUESTION. Without that, cutting the measure here would amount to erasing any response
 * from the perspective of the desktop app, and its welcome modal reopened at
 * next launch — the settings switch turned the question back on
 * was supposed to close.
 *
 * The starting state is `false` the time of editing, like everywhere where we read the
 * local storage: server rendering doesn't see it, and assuming it would
 * diverger l'hydratation.
 */
export function AccountAnalyticsSection() {
  const t = useTranslations("Analytics");
  const locale = useLocale() as Locale;
  const { user, updateUserMetadata } = useAuth();
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    // This device first; failing that, what the account carries. The switch
    // therefore shows the good state on a machine where we have just arrived, instead of
    // to announce “off” to someone who said yes elsewhere.
    const local = readConsent();
    setAccepted((local ?? resolveAnalyticsConsent(user?.user_metadata)) === "accepted");
  }, [user]);

  const toggle = (next: boolean) => {
    const consent = next ? "accepted" : "declined";
    setAccepted(next);
    // `writeConsent` immediately warns PostHog (CONSENT_CHANGED_EVENT):
    // cut here cuts the measurement immediately, without reloading.
    writeConsent(consent);
    void updateUserMetadata({ [ANALYTICS_CONSENT_META_KEY]: consent }).catch(
      (e: unknown) => console.error("[analytics] consentement non enregistré:", e)
    );
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
