"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Boxes,
  Equal,
  FileText,
  GitFork,
  Laptop,
  LayoutGrid,
  MessagesSquare,
  Plug,
  Route,
  Server,
  Tag,
  Terminal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "mangue-ui/components/ui/sheet";
import { cn } from "mangue-ui/lib/utils";
import { MinddyLogo } from "@/components/minddy-logo";
import { NumoFace } from "@/components/numo-face";
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
  icon: LucideIcon;
  external?: boolean;
};

/** Shared destinations for the desktop product menu and mobile drawer. */
const PRODUCT_ENTRIES: ReadonlyArray<ProductEntry> = [
  { key: "tracker", href: "/#tracker", icon: LayoutGrid },
  { key: "agents", href: "/#agents", icon: Plug },
  { key: "numo", href: "/#numo", icon: null },
  { key: "speed", href: "/#speed", icon: Zap },
  { key: "pages", href: "/#pages", icon: FileText },
  { key: "feedback", href: "/#feedback", icon: MessagesSquare },
  { key: "more", href: "/#more", icon: Boxes },
  { key: "mcp", href: "/mcp", icon: Terminal },
  { key: "selfHosting", href: "/self-hosting", icon: Server },
  // The desktop app is last because it describes where Minddy runs rather than
  // what it does. It remains discoverable without displacing the product story.
  { key: "download", href: "/download", icon: Laptop },
];

/** Direct navigation complements the product menu with an overview and pricing. */
const LINKS: ReadonlyArray<NavLink> = [
  { href: "/#workspace", key: "navHowItWorks", icon: Route },
  { href: "/pricing", key: "navPricing", icon: Tag },
  { href: "https://github.com/mangue-dev/minddy", key: "navOpenSource", icon: GitFork, external: true },
];

/** Line and icon pad of the mobile drawer, shared by its two blocks. */
const MOBILE_ROW =
  "flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted active:scale-[0.99]";
const MOBILE_ICON =
  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground";

function NavLogo() {
  return (
    <span className="flex items-center gap-2">
      <MinddyLogo className={cn("h-7 w-auto text-foreground", ENV_LOGO_TINT[getAppEnv()])} />
      <span className="font-display text-lg font-semibold tracking-tight">minddy</span>
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
    <>
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
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={t("mobileMenuOpen")}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground lg:hidden"
            >
              <Equal className="h-5 w-5" />
            </button>

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

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="flex w-[88%] max-w-[380px] flex-col gap-0 p-0">
          <SheetTitle className="sr-only">{t("mobileMenuTitle")}</SheetTitle>

          <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
            <Link
              href={href("/")}
              aria-label="minddy"
              onClick={(event) => {
                setMobileOpen(false);
                handleLogoClick(event);
              }}
            >
              <NavLogo />
            </Link>
          </div>

          {/* On touch screen there is no hover, therefore no menu: the drawer
              unfolds what the “Product” menu groups together, under its title, and
              the two direct links follow. Same targets, same order. */}
          <div className="flex-1 overflow-y-auto p-3">
            <p className="px-2.5 pt-1 pb-2 text-xs font-medium text-muted-foreground">
              {t("navProduct")}
            </p>
            {PRODUCT_ENTRIES.map((entry) => (
              <SheetClose key={entry.href} asChild>
                <a href={href(entry.href)} className={MOBILE_ROW}>
                  <span className={MOBILE_ICON}>
                    {entry.icon ? (
                      <entry.icon className="h-4 w-4" />
                    ) : (
                      <NumoFace className="h-3.5 w-auto" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {t(`navMenu_${entry.key}_title`)}
                    </span>
                    <span className="block text-xs leading-snug text-muted-foreground">
                      {t(`navMenu_${entry.key}_desc`)}
                    </span>
                  </span>
                </a>
              </SheetClose>
            ))}

            <div className="my-2 border-t border-border" />

            {LINKS.map((link) => {
              const Icon = link.icon;
              const content = (
                <>
                  <span className={MOBILE_ICON}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-foreground">{t(link.key)}</span>
                </>
              );
              return (
                <SheetClose key={link.href} asChild>
                  {link.external ? (
                    <a href={link.href} target="_blank" rel="noreferrer" className={MOBILE_ROW}>
                      {content}
                    </a>
                  ) : link.href.startsWith("/#") ? (
                    <a href={href(link.href)} className={MOBILE_ROW}>
                      {content}
                    </a>
                  ) : (
                    <Link href={href(link.href)} className={MOBILE_ROW}>
                      {content}
                    </Link>
                  )}
                </SheetClose>
              );
            })}
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <SheetClose asChild>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link href={hasSession ? "/home" : "/login"}>
                  {t(hasSession ? "navOpenApp" : "navSignIn")}
                </Link>
              </Button>
            </SheetClose>
            <SheetClose asChild>
              <Button asChild size="lg" className="w-full">
                <Link href={href("/download")}
                  onClick={() => track("landing_cta_clicked", { location: "nav" })}>
                  {t("downloadMinddy")}
                </Link>
              </Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
