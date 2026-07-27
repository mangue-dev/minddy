"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "mangue-ui";
import { MinddyLogo } from "@/components/minddy-logo";
import { setLocaleCookie } from "@/lib/set-locale";
import { localizedHref, switchLocaleHref } from "@/lib/locale-href";
import { ENV_LOGO_TINT, getAppEnv } from "@/lib/env";
import type { Locale } from "@/i18n/config";

/**
 * Pied de page du site public (MIN-73). Reprend la grille du footer d'AutoKap :
 * bloc marque + colonnes de liens, barre de bas de page, et le mot-symbole géant
 * rogné par le bas — la seule fantaisie assumée de la page.
 */

const CONTACT_EMAIL = "hello@minddy.app";

type FooterColumn = {
  titleKey: string;
  links: ReadonlyArray<{ href: string; labelKey: string }>;
};

const COLUMNS: ReadonlyArray<FooterColumn> = [
  {
    titleKey: "footerColProduct",
    links: [
      // Ordre du nouveau plan de la landing. `#numo`, `#voice`, `#scratchpad`
      // et `#workflow` ne sont plus des sections mais restent des ancres, posées
      // sur les blocs qui les ont absorbés : ces liens — et ceux déjà partagés —
      // tombent toujours au bon endroit.
      { href: "/#tracker", labelKey: "navMenu_tracker_title" },
      { href: "/#speed", labelKey: "footerSpeed" },
      { href: "/#voice", labelKey: "footerVoice" },
      { href: "/#scratchpad", labelKey: "footerScratchpad" },
      { href: "/#agents", labelKey: "footerAgents" },
      { href: "/#workflow", labelKey: "navHowItWorks" },
      { href: "/#numo", labelKey: "footerNumo" },
      { href: "/#feedback", labelKey: "footerFeedback" },
      { href: "/#more", labelKey: "footerMore" },
      { href: "/pricing", labelKey: "navPricing" },
    ],
  },
  {
    titleKey: "footerColResources",
    links: [
      { href: "/#faq", labelKey: "navFaq" },
      { href: "/login", labelKey: "navSignIn" },
      { href: "/signup", labelKey: "navGetStarted" },
    ],
  },
  {
    titleKey: "footerColLegal",
    links: [
      { href: "/legal", labelKey: "footerLegalNotice" },
      { href: "/terms", labelKey: "footerTerms" },
      { href: "/privacy", labelKey: "footerPrivacy" },
      { href: "/cookies", labelKey: "footerCookies" },
    ],
  },
];

export function MarketingFooter() {
  const t = useTranslations("Landing");
  const tLang = useTranslations("Language");
  const locale = useLocale() as Locale;
  const [selected, setSelected] = useState<Locale>(locale);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  // Changer de langue CHANGE D'URL sur le site public (MIN-88) : `/pricing`
  // devient `/fr/tarifs`. Le cookie seul ne suffisait pas — il rafraîchissait la
  // page en français en laissant l'URL annoncer l'anglais, ce que le canonical
  // et le hreflang contredisaient aussitôt. Sur l'app interne (aucune URL
  // localisée), `switchLocaleHref` renvoie `null` et on se contente du cookie.
  const handleLocaleChange = async (value: string) => {
    const next = value as Locale;
    setSelected(next);
    await setLocaleCookie(next);
    const target = switchLocaleHref(pathname, next);
    startTransition(() => (target ? router.push(target) : router.refresh()));
  };

  return (
    <footer className="relative overflow-hidden border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-6 pt-16 pb-8 sm:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.5fr_repeat(3,1fr)] md:gap-x-8">
          <div className="col-span-2 flex flex-col gap-5 md:col-span-1">
            <Link
              href={localizedHref("/", locale)}
              aria-label="minddy"
              className="flex w-fit items-center gap-2"
            >
              <MinddyLogo
                className={cn("h-7 w-auto text-foreground", ENV_LOGO_TINT[getAppEnv()])}
              />
              <span className="font-display text-lg font-semibold tracking-tight">minddy</span>
            </Link>
            <p className="max-w-[18rem] text-sm leading-relaxed text-muted-foreground">
              {t("footerTagline")}
            </p>
            <Select value={selected} onValueChange={handleLocaleChange}>
              {/* `aria-label` : le déclencheur d'un Select ne rend que la valeur
                  choisie (« Français »), donc un lecteur d'écran annonçait une
                  liste déroulante sans savoir ce qu'elle règle — et l'audit
                  `button-name` échouait sur toutes les pages publiques. */}
              <SelectTrigger
                aria-label={tLang("title")}
                className="h-8 w-auto self-start bg-transparent text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Colonnes en `<nav aria-labelledby>` et non en `<h2>` : trois titres
              de section de plus dans le plan de CHAQUE page, entre « Questions
              fréquentes » et rien du tout, alors que « Produit » ou « Légal »
              ne sont pas des sections de la page — ce sont les étiquettes de
              trois listes de liens. Le rôle `navigation` les nomme sans les
              faire entrer dans la hiérarchie des titres. */}
          {COLUMNS.map((column) => (
            <nav
              key={column.titleKey}
              aria-labelledby={`footer-col-${column.titleKey}`}
              className="flex flex-col gap-3"
            >
              <p
                id={`footer-col-${column.titleKey}`}
                className="text-xs font-medium tracking-wide text-foreground/90"
              >
                {t(column.titleKey)}
              </p>
              <ul className="flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={localizedHref(link.href, locale)}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col-reverse gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span>&copy; {new Date().getFullYear()} minddy</span>
            <span>
              {t.rich("footerMadeBy", {
                author: (chunks) => (
                  <a
                    href="https://mangue.work"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground/90 transition-colors hover:text-foreground"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </span>
          </div>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="transition-colors hover:text-foreground"
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>

      {/* Mot-symbole géant : sa moitié basse passe sous le pli du footer
          (overflow-hidden), ce qui donne du poids à la marque sans occuper la
          hauteur d'une vraie section. */}
      <div aria-hidden className="pointer-events-none mx-auto max-w-7xl px-4 select-none sm:px-6">
        <span className="block translate-y-[38%] text-center font-display text-[clamp(6rem,22vw,22rem)] leading-none font-bold tracking-[-0.06em] text-foreground/[0.06] dark:text-foreground/[0.09]">
          minddy
        </span>
      </div>
    </footer>
  );
}
