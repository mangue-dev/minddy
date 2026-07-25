"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bot, Equal, HelpCircle, LayoutGrid, Tag, type LucideIcon } from "lucide-react";
import { Button, Sheet, SheetClose, SheetContent, SheetTitle, cn } from "mangue-ui";
import { MinddyLogo } from "@/components/minddy-logo";
import { getSupabase } from "@/lib/supabase";
import { ENV_LOGO_TINT, getAppEnv } from "@/lib/env";
import { useAnalytics } from "@/lib/use-analytics";

/**
 * Barre de navigation du site public (MIN-73) — landing, tarifs, pages légales.
 *
 * Pastille flottante centrée, reprise du layout de la nav d'AutoKap : grille
 * `1fr auto 1fr` pour que les liens restent optiquement centrés quel que soit
 * l'encombrement du logo et des boutons. Elle se rétracte dès qu'on quitte le
 * premier écran et revient quand on remonte : sur une landing, la nav appartient
 * au hero, pas au défilement.
 */

type NavLink = {
  href: string;
  key: string;
  icon: LucideIcon;
};

// Ancres directes plutôt qu'un popover : sur un site de deux pages, un menu
// déroulant coûte un clic pour rien.
//
// Les quatre entrées suivent le plan de la page. Avant, la nav pointait sur
// `#workflow` et `#features` — deux ancres qui n'existent plus comme sections —
// et ignorait `#agents`, qui est pourtant la cible du badge du hero.
//
// « Tarifs » vise la section de la landing et non `/pricing` : le comparatif
// complet reste à un clic, par le lien « Comparer les plans en détail » sous les
// cartes. Le préfixe `/#` garantit le retour vers la landing depuis /pricing ou
// une page légale.
const LINKS: ReadonlyArray<NavLink> = [
  { href: "/#tracker", key: "navFeatures", icon: LayoutGrid },
  { href: "/#agents", key: "navAgents", icon: Bot },
  { href: "/#pricing", key: "navPricing", icon: Tag },
  { href: "/#faq", key: "navFaq", icon: HelpCircle },
];

function NavLogo() {
  return (
    <span className="flex items-center gap-2">
      <MinddyLogo className={cn("h-7 w-auto text-foreground", ENV_LOGO_TINT[getAppEnv()])} />
      <span className="font-display text-lg font-semibold tracking-tight">minddy</span>
    </span>
  );
}

/**
 * Sonde de session, côté client uniquement.
 *
 * Le site public n'est pas enveloppé dans les providers de l'app : on a juste
 * besoin de savoir s'il existe une session pour remplacer le couple
 * connexion/inscription par un unique « ouvrir l'app ». Lecture côté client
 * plutôt que côté serveur pour que les pages restent cacheables ; on part de
 * `false` (le cas majoritaire) pour que le rendu serveur et le premier paint
 * coïncident, un visiteur déjà connecté voit la bascule après hydratation.
 */
function useHasSession(): boolean {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return hasSession;
}

export function MarketingNav() {
  const { track } = useAnalytics();
  const t = useTranslations("Landing");
  const [mobileOpen, setMobileOpen] = useState(false);
  const hasSession = useHasSession();

  const [pinned, setPinned] = useState(true);
  useEffect(() => {
    const onScroll = () => setPinned(window.scrollY < window.innerHeight * 0.5);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Sur la landing, cliquer le logo ne déclenche aucune navigation (on y est
  // déjà) : on remonte donc explicitement, et on efface l'ancre pour que l'URL
  // reflète la position réelle. Ailleurs, le lien fait son travail.
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
      <header
        className={cn(
          "sticky top-0 z-50 px-3 pt-3 pb-2 transition-transform duration-300 ease-out sm:px-4 sm:pt-4",
          pinned ? "translate-y-0" : "-translate-y-[130%]",
        )}
      >
        <div className="mx-auto grid h-14 w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-full border border-border bg-card/95 pr-3 pl-5 shadow-sm backdrop-blur-md">
          <Link
            href="/"
            onClick={handleLogoClick}
            aria-label="minddy"
            className="justify-self-start rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <NavLogo />
          </Link>

          <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex lg:gap-7">
            {LINKS.map((link) =>
              link.href.startsWith("/#") ? (
                <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
                  {t(link.key)}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
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

            <div className="hidden items-center gap-2 sm:flex">
              {hasSession ? (
                <Button asChild size="sm" className="px-4">
                  <Link href="/home">{t("navOpenApp")}</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="ghost" size="sm" className="px-4">
                    <Link href="/login">{t("navSignIn")}</Link>
                  </Button>
                  <Button asChild size="sm" className="px-4">
                    <Link
                      href="/signup"
                      onClick={() => track("landing_cta_clicked", { location: "nav" })}
                    >
                      {t("navGetStarted")}
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
              href="/"
              aria-label="minddy"
              onClick={(event) => {
                setMobileOpen(false);
                handleLogoClick(event);
              }}
            >
              <NavLogo />
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {LINKS.map((link) => {
              const Icon = link.icon;
              const className =
                "flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted active:scale-[0.99]";
              const content = (
                <>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-foreground">{t(link.key)}</span>
                </>
              );
              return (
                <SheetClose key={link.href} asChild>
                  {link.href.startsWith("/#") ? (
                    <a href={link.href} className={className}>
                      {content}
                    </a>
                  ) : (
                    <Link href={link.href} className={className}>
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
