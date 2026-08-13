"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "mangue-ui/components/ui/button";
import { readConsent, writeConsent, type CookieConsent } from "@/lib/cookie-consent";
import { isDesktop } from "@/lib/desktop/bridge";
import { useAnalytics } from "@/lib/use-analytics";
import { localizedHref } from "@/lib/locale-href";
import { SITE_URL } from "@/lib/site";
import type { Locale } from "@/i18n/config";

/**
 * Bandeau de consentement aux cookies analytiques. Ne s'affiche que tant
 * qu'aucun choix n'a été fait, et jamais côté serveur (le localStorage n'est lu
 * qu'après montage, sinon le HTML pré-rendu afficherait le bandeau à tout le
 * monde le temps de l'hydratation).
 *
 * ## Et jamais dans l'app de bureau (MIN-291)
 *
 * Une carte flottante qui demande la permission de mesurer est un objet de
 * SITE : elle s'adresse à quelqu'un qui vient d'arriver de nulle part et à qui
 * on doit une information avant de rien écrire chez lui. Dans une app qu'on a
 * téléchargée, signée, installée et ouverte, elle n'a plus personne à informer
 * de cette façon-là — elle dit seulement « ceci est un site web dans une
 * fenêtre ».
 *
 * Ce qui ne disparaît pas, c'est le CHOIX. Il déménage dans les réglages
 * (components/settings/account-analytics-section.tsx), où toute app de bureau le
 * met, et il y est réversible — ce qu'il n'était pas jusqu'ici, une fois le
 * bandeau répondu. Tant qu'il n'est pas fait, le consentement vaut `null` et
 * PostHog reste sans cookie ni identité, exactement comme pour un visiteur du
 * web qui n'a pas encore tranché : **rien n'est mesuré en douce**. La
 * contrepartie est réelle et assumée — la mesure d'audience est éteinte par
 * défaut sur l'app de bureau.
 */
export function CookieBanner() {
  const t = useTranslations("CookieBanner");
  const locale = useLocale() as Locale;
  const { track } = useAnalytics();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(readConsent() === null && !isDesktop());
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
      // Le padding bas : la page est à fond perdu depuis que le root layout
      // déclare `viewport-fit=cover`, donc `bottom-4` compte désormais depuis le
      // bord PHYSIQUE — 16 px, soit moins que la barre d'indicateur d'accueil.
      // Le padding remonte la carte au-dessus d'elle. Même geste que le FAB de
      // Numo et le bandeau de nouvelle version.
      //
      // Ne PAS abréger un utilitaire à valeur arbitraire par des points de
      // suspension dans un commentaire : Tailwind scanne le fichier entier,
      // commentaires compris, et génère une règle avec les points dedans —
      // qui ne compile pas. On écrit la classe en entier, ou pas du tout.
      className="fixed inset-x-4 bottom-4 z-50 pb-[env(safe-area-inset-bottom)] md:left-auto md:right-6 md:max-w-sm"
    >
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-lg">
        <p className="text-sm font-semibold text-card-foreground">{t("title")}</p>
        <p className="text-xs text-muted-foreground">
          {t("description")}{" "}
          {/* URL ABSOLUE, et une balise <a> plutôt qu'un <Link> : ce bandeau est
              monté par le root layout, donc aussi sur un board de feedback servi
              depuis le domaine de son éditeur (MIN-36). Là-bas, le proxy réécrit
              tout ce qu'il ne reconnaît pas vers /f/<token>/… : un `/cookies`
              relatif partait en 404, et le consentement se recueillait sans que
              la personne puisse lire à quoi elle consent. Même correctif que la
              mention d'information du board (app/f/[token]/feedback-auth.tsx). */}
          <a
            href={`${SITE_URL}${localizedHref("/cookies", locale)}`}
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
