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
  key: MessageKey<"Landing">;
  icon: LucideIcon;
};

/**
 * Le menu « Produit » : les six sections de la landing, chacune avec ce qu'on y
 * trouve. La nav listait quatre ancres nues — « Le tracker », « Les agents »,
 * « Tarifs », « FAQ » — dont deux n'apprenaient rien à qui ne connaît pas
 * minddy, et laissait de côté la moitié de la page (la vitesse, le board de
 * feedback, le reste). Un mot qui regroupe vaut mieux que quatre qui se
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
  // La seule entrée qui mène à une PAGE et non à une section de la landing
  // (MIN-93). Elle est en dernier pour que le menu se lise toujours comme le
  // plan de la landing, et sa description dit « documentation » sans le mot :
  // c'est ce qui la distingue de l'entrée « Agents & MCP » juste au-dessus.
  { key: "mcp", href: "/mcp", icon: Terminal },
  // L'app Mac (MIN-292), en dernier : c'est la seule entrée qui ne parle pas de
  // ce que fait minddy mais de l'endroit d'où on s'en sert. Elle a sa place ici
  // parce qu'elle est indexable et qu'un lien interne vaut plus qu'une ligne de
  // sitemap — mais pas plus haut, sinon elle passerait pour la façon normale
  // d'utiliser minddy, alors que le navigateur en reste le lieu.
  { key: "download", href: "/download", icon: Laptop },
];

/**
 * Les deux liens directs qui accompagnent le menu.
 *
 * « Comment ça marche » vise `#workflow`, le parcours ticket → pull request :
 * c'est la question que se pose un visiteur qui vient de lire le hero, et la
 * section y répond en trois images. La FAQ a quitté la nav — elle est en bas de
 * page, on y arrive en lisant, pas en la cherchant, et elle occupait une place
 * de nav pour une objection qu'on n'a pas encore.
 *
 * « Tarifs » vise la PAGE `/pricing`, et non plus la section de la landing :
 * quelqu'un qui clique « Tarifs » dans une barre de navigation demande la
 * grille complète, pas un défilement vers trois cartes suivies d'un second lien
 * à trouver. C'est aussi la seule entrée de la nav qui menait à une ancre alors
 * qu'une vraie page existait — et un lien interne de plus vers une page
 * indexable ne se refuse pas.
 */
const LINKS: ReadonlyArray<NavLink> = [
  { href: "/#workflow", key: "navHowItWorks", icon: Route },
  { href: "/pricing", key: "navPricing", icon: Tag },
];

/** Ligne et pastille d'icône du tiroir mobile, partagées par ses deux blocs. */
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
 * Sonde de session, côté client uniquement.
 *
 * Le site public n'est pas enveloppé dans les providers de l'app : on a juste
 * besoin de savoir s'il existe une session pour remplacer le couple
 * connexion/inscription par un unique « ouvrir l'app ». Lecture côté CLIENT et
 * non côté serveur pour que les pages publiques restent cacheables par le CDN —
 * un `signedIn` calculé au rendu rendrait le HTML dépendant des cookies, ce qui
 * annulerait le travail de mise en cache du même lot. On part de `false` (le
 * cas majoritaire) pour que le rendu serveur et le premier paint coïncident.
 *
 * DEUX PARESSES (MIN-88, revues par MIN-100), parce que
 * `@supabase/supabase-js` pesait dans le bundle INITIAL de la landing pour un
 * simple libellé de bouton :
 *
 * 1. Le SDK vit derrière un `next/dynamic` (`session-probe.tsx`) — donc dans un
 *    vrai chunk paresseux. Un `import()` nu ne suffisait PAS : Turbopack en place
 *    la cible dans le groupe de chunks initial du composant, et les 18 Ko
 *    gzippés partaient quand même avec le bundle de départ (mesuré).
 * 2. La sonde n'est même pas montée si aucun cookie d'auth Supabase n'est
 *    présent. Un visiteur anonyme — l'immense majorité sur une landing — ne
 *    demande donc jamais ce chunk.
 */
const SessionProbe = dynamic(
  () => import("./session-probe").then((m) => m.SessionProbe),
  { ssr: false },
);

function hasAuthCookie(): boolean {
  // Supabase nomme ses cookies `sb-<ref>-auth-token[.n]`. On ne cherche qu'un
  // indice, pas une preuve : le SDK reste seul juge de la validité.
  return document.cookie.includes("-auth-token");
}

/** `[a-t-on une session, faut-il la demander]`. On part de `false` : le rendu
    serveur et le premier paint coïncident donc pour le cas majoritaire. */
function useSession(): [boolean, boolean, (v: boolean) => void] {
  const [hasSession, setHasSession] = useState(false);
  const [probe, setProbe] = useState(false);
  useEffect(() => setProbe(hasAuthCookie()), []);
  return [hasSession, probe, setHasSession];
}

export function MarketingNav() {
  const { track } = useAnalytics();
  const t = useTranslations("Landing");
  // Les liens sont écrits une fois en anglais canonique ; sur `/fr` ils doivent
  // pointer vers les URLs françaises, sinon le premier clic ramène en anglais.
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

            {/* DEUX BOUTONS, jamais trois (MIN-292) : se connecter, et
                télécharger — le téléchargement en PRIMAIRE. L'app de bureau est
                la porte qu'on veut pousser, et elle mène de toute façon à la
                création de compte : on ne fait pas choisir entre deux portes qui
                donnent sur la même pièce.

                **« Créer un compte » a quitté la barre**, et ce n'est pas une
                omission. Trois contrôles côte à côte demandaient au visiteur de
                trancher là où le hero le fait déjà pour lui ; l'inscription
                reste à un clic — depuis le hero, depuis la page de
                téléchargement, depuis l'écran de connexion qui porte « pas
                encore de compte ». Et une session existante remplace de toute
                façon les deux boutons par un seul « ouvrir l'app ». */}
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

          {/* Au tactile il n'y a pas de survol, donc pas de menu : le tiroir
              déplie ce que le menu « Produit » regroupe, sous son intitulé, et
              les deux liens directs suivent. Mêmes cibles, même ordre. */}
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
