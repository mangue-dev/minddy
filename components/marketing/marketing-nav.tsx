"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Download, Equal, X } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "mangue-ui/components/ui/sheet";
import { cn } from "mangue-ui/lib/utils";
import { MinddyLogo } from "@/components/minddy-logo";
import styles from "./nav-wordmark.module.css";
import { NavProductMenu, type ProductEntry } from "./nav-product-menu";
import { ENV_LOGO_TINT, getAppEnv } from "@/lib/env";
import { useAnalytics } from "@/lib/use-analytics";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Public site navigation bar (MIN-73) — landing, prices, legal pages.
 *
 * Full-width sticky bar with a `1fr auto 1fr` grid so the links remain
 * optically centered regardless of the logo and account actions. It stays
 * visible across the whole marketing surface so navigation and conversion
 * actions remain available on long pages.
 */

type NavLink = {
  href: string;
  key: MessageKey<"Landing">;
  external?: boolean;
};

/** Shared destinations for the desktop product menu and mobile drawer. */
const PRODUCT_ENTRIES: ReadonlyArray<ProductEntry> = [
  { key: "tracker", href: "/#tracker" },
  { key: "agents", href: "/#agents" },
  { key: "numo", href: "/#numo" },
  { key: "speed", href: "/#speed" },
  { key: "pages", href: "/#pages" },
  { key: "feedback", href: "/#feedback" },
  { key: "more", href: "/#more" },
  { key: "mcp", href: "/mcp" },
  { key: "selfHosting", href: "/self-hosting" },
  // The desktop app is last because it describes where Minddy runs rather than
  // what it does. It remains discoverable without displacing the product story.
  { key: "download", href: "/download" },
];

/** Direct navigation complements the product menu with an overview and pricing. */
const LINKS: ReadonlyArray<NavLink> = [
  { href: "/#workspace", key: "navHowItWorks" },
  { href: "/pricing", key: "navPricing" },
  { href: "https://github.com/mangue-dev/minddy", key: "navOpenSource", external: true },
];

const MOBILE_ROW =
  "flex min-h-11 items-center justify-between gap-4 rounded-lg py-2 text-xl leading-snug tracking-tight transition-colors hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

const WORDMARK_COLORS = ["#cbd9e6", "#ccdccb", "#e7d3c4", "#c9dedd", "#c9dedd", "#dfd9b8"];

function NavLogo() {
  return (
    <span className={cn("flex items-center gap-2", styles.brand)}>
      <MinddyLogo className={cn("h-7 w-auto text-foreground", ENV_LOGO_TINT[getAppEnv()])} />
      <span className="font-display text-lg font-semibold tracking-tight" aria-hidden>
        {Array.from("minddy", (letter, index) => (
          <span key={index} className={styles.letter} style={{
            "--letter-color": WORDMARK_COLORS[index],
            "--letter-index": index,
          } as React.CSSProperties}>
            {letter}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Load the session SDK only when an auth cookie suggests a returning visitor. */
const SessionProbe = dynamic(
  () => import("./session-probe").then((m) => m.SessionProbe),
  { ssr: false },
);

function hasAuthCookie(): boolean {
  // Supabase cookies are only a hint; the SDK checks session validity.
  return document.cookie.includes("-auth-token");
}

/** `[has a session, should probe]`. Starting false keeps server and first paint aligned. */
function useSession(): [boolean, boolean, (v: boolean) => void] {
  const [hasSession, setHasSession] = useState(false);
  const [probe, setProbe] = useState(false);
  useEffect(() => setProbe(hasAuthCookie()), []);
  return [hasSession, probe, setHasSession];
}

export function MarketingNav() {
  const { track } = useAnalytics();
  const t = useTranslations("Landing");
  // Links are written once in canonical English; on `/fr` they must
  // point to French URLs, otherwise the first click returns to English.
  const locale = useLocale() as Locale;
  const href = (path: string) => localizedHref(path, locale);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const [hasSession, probeSession, setHasSession] = useSession();

  // On the landing, clicking the logo does not trigger any navigation (we are there
  // already): we therefore go back explicitly, and we delete the anchor so that the URL
  // reflects the actual position. Elsewhere, the link does its job.
  const handleLogoClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.location.pathname !== localizedHref("/", locale)) return;
    event.preventDefault();
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [locale]);

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      {probeSession && <SessionProbe onChange={setHasSession} />}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 text-foreground backdrop-blur-md">
        <div className="mx-auto grid h-16 w-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6 lg:px-10">
          <Link
            href={href("/")}
            onClick={handleLogoClick}
            aria-label="minddy"
            className="justify-self-start rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <NavLogo />
          </Link>

          <nav className="hidden items-center gap-5 text-sm whitespace-nowrap text-muted-foreground lg:flex lg:gap-7">
            <NavProductMenu entries={PRODUCT_ENTRIES} label={t("navProduct")} locale={locale} />
            {LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  {t(link.key)}
                </a>
              ) : link.href.startsWith("/#") ? (
                <a key={link.href} href={href(link.href)} className="transition-colors hover:text-foreground">
                  {t(link.key)}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={href(link.href)}
                  className="transition-colors hover:text-foreground"
                >
                  {t(link.key)}
                </Link>
              ),
            )}
          </nav>

          <div className="col-start-3 flex items-center gap-2 justify-self-end">
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={t("mobileMenuOpen")}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground lg:hidden"
              >
                <Equal className="h-5 w-5" />
              </button>
            </SheetTrigger>

            <div className="hidden items-center gap-2 sm:flex">
              <Button asChild variant="ghost" size="sm" className="px-3">
                <Link href={hasSession ? "/home" : "/login"}>
                  {t(hasSession ? "navOpenApp" : "navSignIn")}
                </Link>
              </Button>
              <Button asChild size="sm" className="px-4">
                <Link href={href("/download")}
                  onClick={() => track("landing_cta_clicked", { location: "nav" })}>
                  {t("downloadMinddy")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <SheetContent
        side="right"
        autoFocusOnOpen
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={event => {
          if (window.matchMedia("(min-width: 1024px)").matches) {
            event.preventDefault();
            return;
          }
        }}
        overlayClassName="bg-black/25 motion-reduce:animate-none"
        className="flex min-h-0 flex-col gap-0 bg-background p-0 data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:sm:max-w-[26rem] motion-reduce:animate-none motion-reduce:transition-none"
      >
        <SheetTitle className="sr-only">{t("mobileMenuTitle")}</SheetTitle>
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
          <Link href={href("/")} aria-label="minddy"
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            onClick={event => {
              setMobileOpen(false);
              handleLogoClick(event);
            }}>
            <NavLogo />
          </Link>
          <SheetClose asChild>
            <button type="button" aria-label={t("mobileMenuClose")}
              className="-mr-2 flex size-11 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
              <X className="size-5" aria-hidden />
            </button>
          </SheetClose>
        </div>

        <nav aria-label={t("mobileMenuTitle")} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
          <ul className="space-y-1">
            {LINKS.map(link => (
              <li key={link.href}>
                <SheetClose asChild>
                  <a href={link.external ? link.href : href(link.href)}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noreferrer" : undefined}
                    className={cn(MOBILE_ROW, "text-2xl")}>
                    {t(link.key)}
                    {link.external && <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                  </a>
                </SheetClose>
              </li>
            ))}
          </ul>
          <p className="mt-7 mb-3 text-sm text-muted-foreground">{t("navProduct")}</p>
          <ul>
            {PRODUCT_ENTRIES.filter(entry => entry.key !== "download").map(entry => (
              <li key={entry.href}>
                <SheetClose asChild>
                  <a href={href(entry.href)} className={MOBILE_ROW}>
                    {t(`navMenu_${entry.key}_title`)}
                  </a>
                </SheetClose>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-[#f3f5ef] px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-[#252b27]">
          <SheetClose asChild>
            <Button asChild size="lg" className="min-h-11 w-full rounded-full">
              <Link href={href("/download")}
                onClick={() => track("landing_cta_clicked", { location: "nav" })}>
                {t("downloadMinddy")}
                <Download data-icon="inline-end" />
              </Link>
            </Button>
          </SheetClose>
          <SheetClose asChild>
            <Button asChild variant="ghost" size="lg" className="min-h-11 w-full rounded-full">
              <Link href={hasSession ? "/home" : "/login"}>
                {t(hasSession ? "navOpenApp" : "navSignIn")}
              </Link>
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
