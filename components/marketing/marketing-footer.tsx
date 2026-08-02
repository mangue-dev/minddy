"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "mangue-ui/lib/utils";
import { MinddyLogo } from "@/components/minddy-logo";
import { CopyButton } from "@/components/marketing/copy-button";
import { localizedHref } from "@/lib/locale-href";
import { ENV_LOGO_TINT, getAppEnv } from "@/lib/env";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Pied de page du site public (MIN-73). Reprend la grille du footer d'AutoKap :
 * bloc marque + colonnes de liens, barre de bas de page, et le mot-symbole géant
 * rogné par le bas — la seule fantaisie assumée de la page.
 */

const CONTACT_EMAIL = "hello@minddy.app";

type FooterColumn = {
  titleKey: MessageKey<"Landing">;
  links: ReadonlyArray<{ href: string; labelKey: MessageKey<"Landing"> }>;
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
      { href: "/#agents", labelKey: "footerAgents" },
      { href: "/#workflow", labelKey: "navHowItWorks" },
      { href: "/#numo", labelKey: "footerNumo" },
      { href: "/#speed", labelKey: "footerSpeed" },
      { href: "/#voice", labelKey: "footerVoice" },
      { href: "/#scratchpad", labelKey: "footerScratchpad" },
      { href: "/#feedback", labelKey: "footerFeedback" },
      { href: "/#more", labelKey: "footerMore" },
      { href: "/pricing", labelKey: "navPricing" },
    ],
  },
  {
    titleKey: "footerColResources",
    links: [
      // La doc du serveur MCP en tête de colonne (MIN-93) : c'est la seule
      // ressource du site qui en est vraiment une, et le lien interne qui doit
      // être vu depuis toutes les pages — un crawler compte les liens entrants.
      { href: "/mcp", labelKey: "navMenu_mcp_title" },
      { href: "/changelog", labelKey: "footerChangelog" },
      // Les comparatifs (MIN-93). Ils ne sont NULLE PART ailleurs dans la
      // navigation : sans ces trois liens, chaque page n'aurait que le sitemap
      // pour être découverte, et un lien interne vaut plus qu'une ligne de XML.
      { href: "/alternatives/linear", labelKey: "footerAltLinear" },
      { href: "/alternatives/jira", labelKey: "footerAltJira" },
      { href: "/alternatives/notion", labelKey: "footerAltNotion" },
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

/**
 * Le sélecteur de langue n'est chargé QUE quand on arrive au pied de page
 * (MIN-100).
 *
 * Son `Select` Radix tire le positionneur flottant : 46 Ko gzippés, deuxième
 * poste du bundle des six pages publiques derrière le framework, pour une liste
 * de deux langues qui ne s'ouvre qu'au clic. `ssr: false` seul ne suffisait pas —
 * le composant étant rendu sans condition, React résolvait le `dynamic` dès
 * l'hydratation et les 46 Ko partaient quand même dans la fenêtre du LCP, juste
 * un peu plus tard. L'observer ci-dessous les repousse à l'instant où le pied de
 * page approche, c'est-à-dire jamais pour un visiteur qui ne descend pas.
 *
 * La place est réservée en dur (`h-8`) : rien ne bouge quand il apparaît.
 */
const LanguageSwitcher = dynamic(
  () => import("./language-switcher").then((m) => m.LanguageSwitcher),
  { ssr: false },
);

/**
 * Les infobulles de l'adresse de contact, sous le même verrou et pour la même
 * raison : Radix y tire le positionneur flottant. Voir
 * [footer-hint.tsx](footer-hint.tsx).
 */
const FooterHint = dynamic(() => import("./footer-hint").then((m) => m.FooterHint), {
  ssr: false,
});

export function MarketingFooter() {
  const t = useTranslations("Landing");
  const locale = useLocale() as Locale;
  const [reached, setReached] = useState(false);
  const slot = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = slot.current;
    // Sans IntersectionObserver, on monte tout de suite : mieux vaut le poids
    // qu'un sélecteur de langue absent.
    if (!el || typeof IntersectionObserver === "undefined") {
      setReached(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setReached(true);
        io.disconnect();
      },
      // Une marge confortable : le chargement démarre avant qu'on n'y soit, donc
      // le sélecteur est déjà là quand le pied de page entre vraiment.
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // L'élément est écrit une seule fois : nu tant que l'infobulle n'est pas
  // arrivée, enveloppé ensuite. C'est ce qui garde le lien `mailto:` dans le
  // HTML rendu côté serveur, alors que l'infobulle, elle, est chargée en
  // différé.
  const withHint = (label: string, child: ReactElement) =>
    reached ? <FooterHint label={label}>{child}</FooterHint> : child;

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
            <div ref={slot} className="h-8 self-start">
              {reached && <LanguageSwitcher />}
            </div>
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
          {/* L'adresse de contact, et son bouton « copier » posé à gauche. Il ne
              se montre qu'au survol, mais sa boîte est là en permanence
              (opacité, pas affichage) : l'adresse ne bouge pas d'un pixel quand
              il apparaît. Là où il n'y a pas de survol — un écran tactile — il
              reste visible, d'où l'`opacity-100` de base que seul
              `@media (hover: hover)` efface.

              Les deux gestes se ressemblent trop pour se passer d'étiquette :
              une icône « copier » collée à une adresse cliquable, sans rien qui
              dise laquelle fait quoi. D'où une infobulle sur chacun. */}
          <span className="group inline-flex items-center gap-1">
            <span className="inline-flex size-[22px] items-center justify-center">
              {withHint(
                t("footerCopyEmail"),
                <CopyButton
                  text={CONTACT_EMAIL}
                  label={t("footerCopyEmail")}
                  copiedLabel={t("footerEmailCopied")}
                  iconOnly
                  className="opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
                />,
              )}
            </span>
            {withHint(
              t("footerSendEmail"),
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="transition-colors hover:text-foreground"
              >
                {CONTACT_EMAIL}
              </a>,
            )}
          </span>
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
