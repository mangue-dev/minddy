"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Boxes,
  Equal,
  Download,
  FileText,
  Laptop,
  LayoutGrid,
  MessagesSquare,
  Plug,
  Route,
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
 * Centered floating dot, taken from the layout of the AutoKap nav: grid
 * `1fr auto 1fr` so that the links remain optically centered regardless
 * the clutter of the logo and buttons. It retracts as soon as you leave the
 * first screen and returns when you go back up: on a landing, the nav belongs
 * to the hero, not to the scrolling.
 */

type NavLink = {
  href: string;
  key: MessageKey<"Landing">;
  icon: LucideIcon;
};

/**
 * The “Product” menu: the six sections of the landing, each with what we see there
 * find. The nav listed four bare anchors — “The Tracker,” “The Agents,”
 * “Prices”, “FAQ” – two of which teach nothing to those who don’t know
 * minddy, and left out half the page (the speed, the board of
 * feedback, the rest). One word that brings together is better than four that
 * devinent.
 */
const PRODUCT_ENTRIES: ReadonlyArray<ProductEntry> = [
  { key: "tracker", href: "/#tracker", icon: LayoutGrid },
  { key: "agents", href: "/#agents", icon: Plug },
  { key: "numo", href: "/#numo", icon: null },
  { key: "speed", href: "/#speed", icon: Zap },
  { key: "pages", href: "/#pages", icon: FileText },
  { key: "feedback", href: "/#feedback", icon: MessagesSquare },
  { key: "more", href: "/#more", icon: Boxes },
  // The only entry that leads to a PAGE and not to a section of the landing
  // (MIN-93). It is last so that the menu always reads like the
  // plan of the landing, and its description says “documentation” without the word:
  // this is what distinguishes it from the “Agents & MCP” entry just above.
  { key: "mcp", href: "/mcp", icon: Terminal },
  // The Mac app (MIN-292), last: it's the only entry that doesn't talk about
  // what minddy does but from where we use it. She belongs here
  // because it is indexable and an internal link is worth more than a line of
  // sitemap — but not higher, otherwise it would pass for the normal way
  // to use minddy, while the browser remains the place.
  { key: "download", href: "/download", icon: Laptop },
];

/**
 * The two direct links that accompany the menu.
 *
 * “How it works” aims at `#workflow`, the ticket → pull request route:
 * this is the question asked by a visitor who has just read the hero, and the
 * section answers it in three images. The FAQ has left the nav — it is at the bottom of
 * page, you get there by reading, not by looking for it, and it occupied a place
 * of nav for an objection that we do not yet have.
 *
 * “Prices” refers to PAGE `/pricing`, and no longer to the landing section:
 * someone who clicks “Prices” in a navigation bar asks for the
 * full grid, not a scroll to three cards followed by a second link
 * to find. It's also the only entrance to the nav that led to an anchor so
 * that a real page existed — and one more internal link to a page
 * indexable ne se refuse pas.
 */
const LINKS: ReadonlyArray<NavLink> = [
  { href: "/#workflow", key: "navHowItWorks", icon: Route },
  { href: "/pricing", key: "navPricing", icon: Tag },
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

/**
 * Session probe, client side only.
 *
 * The public site is not wrapped in the app's providers: we just have
 * need to know if there is a session to replace the couple
 * connection/registration with a single “open the app”. CUSTOMER side reading and
 * not on the server side so that public pages remain cacheable by the CDN —
 * a `signedIn` calculated at rendering would make the HTML dependent on cookies, which
 * would cancel the caching job of the same batch. We start from `false` (the
 * majority case) so that the server rendering and the first paint coincide.
 *
 * DEUX PARESSES (MIN-88, revues par MIN-100), parce que
 * `@supabase/supabase-js` weighed in the INITIAL bundle of the landing for a
 * simple button label:
 *
 * 1. The SDK lives behind a `next/dynamic` (`session-probe.tsx`) — therefore in a
 *    vrai chunk paresseux. Un `import()` nu ne suffisait PAS : Turbopack en place
 * the target in the initial chunk group of the component, and the 18 KB
 * gzipped files still left with the starting bundle (measured).
 * 2. The probe is not even mounted if no Supabase auth cookie is present
 * here. An anonymous visitor — the vast majority on a landing — does not
 *    demande donc jamais ce chunk.
 */
const SessionProbe = dynamic(
  () => import("./session-probe").then((m) => m.SessionProbe),
  { ssr: false },
);

function hasAuthCookie(): boolean {
  // Supabase nomme ses cookies `sb-<ref>-auth-token[.n]`. On ne cherche qu'un
  // clue, not proof: the SDK remains the sole judge of validity.
  return document.cookie.includes("-auth-token");
}

/** `[a-t-on une session, faut-il la demander]`. We start from `false`: the rendering
    server and the first paint therefore coincide for the majority case. */
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

  const [pinned, setPinned] = useState(true);
  useEffect(() => {
    const onScroll = () => setPinned(window.scrollY < window.innerHeight * 0.5);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // On the landing, clicking the logo does not trigger any navigation (we are there
  // already): we therefore go back explicitly, and we delete the anchor so that the URL
  // reflects the actual position. Elsewhere, the link does its job.
  const handleLogoClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.location.pathname !== "/") return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  return (
    <>
      {probeSession && <SessionProbe onChange={setHasSession} />}
      <header
        className={cn(
          "sticky top-0 z-50 px-3 pt-3 pb-2 transition-transform duration-300 ease-out sm:px-4 sm:pt-4",
          pinned ? "translate-y-0" : "-translate-y-[130%]",
        )}
      >
        <div className="mx-auto grid h-14 w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-full border border-border bg-card/95 pr-3 pl-5 shadow-sm backdrop-blur-md">
          <Link
            href={href("/")}
            onClick={handleLogoClick}
            aria-label="minddy"
            className="justify-self-start rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <NavLogo />
          </Link>

          <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex lg:gap-7">
            <NavProductMenu entries={PRODUCT_ENTRIES} label={t("navProduct")} locale={locale} />
            {LINKS.map((link) =>
              link.href.startsWith("/#") ? (
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
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground md:hidden"
            >
              <Equal className="h-5 w-5" />
            </button>

            {/* TWO BUTTONS, never three (MIN-292): connect, and
                download — download in PRIMARY. The desktop app is
                the door that we want to push, and it leads in any case to the
                account creation: we do not make you choose between two doors which
                overlook the same room.

                **“Create an account” has left the bar**, and it is not a
                omission. Three side-by-side controls asked the visitor to
                to decide where the hero already does it for him; registration
                remains one click away — from the hero, from the page of
                download, from the login screen which says “not
                still counting.” And an existing session replaces any
                way both buttons with a single “open app”. */}
            <div className="hidden items-center gap-2 sm:flex">
              {hasSession ? (
                <Button asChild size="sm" className="px-4">
                  <Link href="/home">{t("navOpenApp")}</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="ghost" size="sm" className="px-3">
                    <Link href="/login">{t("navSignIn")}</Link>
                  </Button>
                  <Button asChild size="sm" className="px-4">
                    <Link
                      href={localizedHref("/download", locale)}
                      onClick={() => track("landing_cta_clicked", { location: "nav" })}
                    >
                      <Download data-icon="inline-start" />
                      {t("navDownload")}
                    </Link>
                  </Button>
                </>
              )}
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
                  {link.href.startsWith("/#") ? (
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
            {hasSession ? (
              <SheetClose asChild>
                <Button asChild size="lg" className="w-full">
                  <Link href="/home">{t("navOpenApp")}</Link>
                </Button>
              </SheetClose>
            ) : (
              <>
                <SheetClose asChild>
                  <Button asChild variant="outline" size="lg" className="w-full">
                    <Link href="/login">{t("navSignIn")}</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild size="lg" className="w-full">
                    <Link href="/signup">{t("navGetStarted")}</Link>
                  </Button>
                </SheetClose>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
