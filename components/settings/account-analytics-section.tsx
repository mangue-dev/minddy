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
 * La mesure d'audience, sous forme d'interrupteur (MIN-291).
 *
 * Le consentement se recueillait UNIQUEMENT dans le bandeau du bas de page, et
 * une fois répondu il devenait irrévocable faute d'écran pour le rouvrir. Ça se
 * tenait tant que le bandeau était le seul chemin ; ça ne tient plus dès lors
 * que l'app de bureau ne l'affiche pas — sans cet écran, personne ne pourrait
 * plus rien choisir du tout là-bas.
 *
 * Même stockage que le bandeau (`lib/cookie-consent.ts`) : le localStorage
 * décide de la MESURE sur cet appareil, et lui seul — consentir sur le web ne
 * pose rien sur une autre machine.
 *
 * Ce qui s'y ajoute (MIN-293) : le choix est recopié dans le compte, qui décide
 * de la QUESTION. Sans ça, couper la mesure ici revenait à effacer toute réponse
 * du point de vue de l'app de bureau, et sa modale de bienvenue se rouvrait au
 * lancement suivant — l'interrupteur des réglages rallumait la question qu'il
 * était censé clore.
 *
 * L'état de départ est `false` le temps du montage, comme partout où l'on lit le
 * stockage local : le rendu serveur ne le voit pas, et le supposer ferait
 * diverger l'hydratation.
 */
export function AccountAnalyticsSection() {
  const t = useTranslations("Analytics");
  const locale = useLocale() as Locale;
  const { user, updateUserMetadata } = useAuth();
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    // Cet appareil d'abord ; à défaut, ce que le compte porte. L'interrupteur
    // montre donc le bon état sur une machine où l'on vient d'arriver, au lieu
    // d'annoncer « éteint » à quelqu'un qui a dit oui ailleurs.
    const local = readConsent();
    setAccepted((local ?? resolveAnalyticsConsent(user?.user_metadata)) === "accepted");
  }, [user]);

  const toggle = (next: boolean) => {
    const consent = next ? "accepted" : "declined";
    setAccepted(next);
    // `writeConsent` prévient PostHog dans la foulée (CONSENT_CHANGED_EVENT) :
    // couper ici coupe la mesure tout de suite, sans rechargement.
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
