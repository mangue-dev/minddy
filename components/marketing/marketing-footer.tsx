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
import { CONTACT_EMAIL } from "@/lib/site";

/**
 * Public site footer (MIN-73). Takes the AutoKap footer grid:
 * brand block + link columns, footer bar, and the giant wordmark
 * cropped from the bottom — the only admitted fantasy of the page.
 */

type FooterColumn = {
  titleKey: MessageKey<"Landing">;
  links: ReadonlyArray<{ href: string; labelKey: MessageKey<"Landing"> }>;
};

const COLUMNS: ReadonlyArray<FooterColumn> = [
  {
    titleKey: "footerColProduct",
    links: [
      // Order of the new landing plan. `#numo`, `#voice`, `#scratchpad`
      // and `#workflow` are no longer sections but remain anchors, placed
      // on the blocks which absorbed them: these links — and those already shared —
      // tombent toujours au bon endroit.
      { href: "/#tracker", labelKey: "navMenu_tracker_title" },
      { href: "/#agents", labelKey: "footerAgents" },
      { href: "/#workflow", labelKey: "navHowItWorks" },
      { href: "/#numo", labelKey: "footerNumo" },
      { href: "/#speed", labelKey: "footerSpeed" },
      { href: "/#voice", labelKey: "footerVoice" },
      { href: "/#scratchpad", labelKey: "footerScratchpad" },
      { href: "/#pages", labelKey: "navMenu_pages_title" },
      { href: "/#feedback", labelKey: "footerFeedback" },
      { href: "/#more", labelKey: "footerMore" },
      { href: "/download", labelKey: "footerDownload" },
      { href: "/pricing", labelKey: "navPricing" },
    ],
  },
  {
    titleKey: "footerColResources",
    links: [
      // The MCP server doc at the top of the column (MIN-93): it is the only one
      // site resource which is really one, and the internal link which must
      // be seen from all pages — a crawler counts incoming links.
      { href: "/mcp", labelKey: "navMenu_mcp_title" },
      { href: "/changelog", labelKey: "footerChangelog" },
      // Comparisons (MIN-93). They are NOWHERE else in the
      // navigation: without these three links, each page would only have the sitemap
      // to be discovered, and an internal link is worth more than a line of XML.
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
 * The language selector is ONLY loaded when you arrive at the footer
 * (MIN-100).
 *
 * Its `Select` Radix pulls the floating positioner: 46 KB gzipped, second
 * six page bundle post public behind the framework, for a list
 * of two languages which only opens on click. `ssr: false` alone was not enough —
 * the component being rendered unconditionally, React resolved the `dynamic` as soon as
 * hydration and the 46 KB still left in the LCP window, just
 * a little later. Observing it below pushes them back the moment the foot of
 * approaches, that is to say never for a visitor who does not go down.
 *
 * The place is reserved hard (`h-8`): nothing moves when it appears.
 */
const LanguageSwitcher = dynamic(
  () => import("./language-switcher").then((m) => m.LanguageSwitcher),
  { ssr: false },
);

/**
 * The contact address tooltips, under the same lock and for the same
 * reason: Radix pulls the floating positioner there. See
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
    // Without IntersectionObserver, we go straight up: the weight is better
    // that a missing language selector.
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
      // A comfortable margin: loading starts before we get there, so
      // the selector is already there when the footer actually enters.
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The element is written only once: bare as long as the tooltip is not
  // arrival, then wrapped. This is what keeps the `mailto:` link in the
  // HTML rendered on the server side, while the tooltip is loaded in
  // deferred.
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

          {/* Columns in `<nav aria-labelledby>` and not in `<h2>`: three more section titles
 in the outline of EACH page, between “Frequently asked questions
” and nothing at all, while “Product” or “Legal”
 are not sections of the page — they are the labels de
 three lists of links. The `navigation` role names them without bringing
 into the title hierarchy. */}
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
          {/* The contact address, and its “copy” button on the left. It only shows KEEP_0_TOKEN on hover, but its box is there permanently KEEP 1 TOKEN (opacity, not display): the address does not move a pixel when KEEP 2 TOKEN it appears. Where there is no hover — a touch screen — it
 remains visible, hence the basic `opacity-100` that only
 `@media (hover: hover)` erases.

 The two gestures are too similar to do without a label:
 a “copy” icon stuck to a clickable address, with nothing to say which one does what. Hence a tooltip on each. */}
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

      {/* Giant wordmark: its lower half passes under the fold of the footer
 (overflow-hidden), which gives weight to the brand without occupying the height of a real section. */}
      <div aria-hidden className="pointer-events-none mx-auto max-w-7xl px-4 select-none sm:px-6">
        <span className="block translate-y-[38%] text-center font-display text-[clamp(6rem,22vw,22rem)] leading-none font-bold tracking-[-0.06em] text-foreground/[0.06] dark:text-foreground/[0.09]">
          minddy
        </span>
      </div>
    </footer>
  );
}
