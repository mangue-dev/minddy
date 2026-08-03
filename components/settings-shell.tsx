"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from "mangue-ui";
import type { LucideIcon } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import {
  SETTINGS_SECTION_PARAM,
  settingsSectionAnchor,
  type SettingsSectionId,
} from "@/lib/settings-sections";

export type SettingsTab = {
  value: string;
  label: string;
  icon?: LucideIcon;
  hidden?: boolean;
  /** Pastille d'attention sur l'onglet — un réglage y est incomplet. La chaîne
      est ce que dit le survol et ce que lit un lecteur d'écran : le point seul
      n'apprendrait rien à qui ne le voit pas. */
  indicator?: string;
  content: ReactNode;
};

type SettingsShellProps = {
  title: string;
  description?: string;
  defaultTab: string;
  tabs: SettingsTab[];
  /** Rendered between the header and the tab grid (banners, warnings…). */
  topSlot?: ReactNode;
};

/** La largeur de la colonne de réglages, la MÊME des deux côtés (MIN-167). Le
    compte tenait en 880 px et le projet en 1080 : deux écrans qui partagent un
    shell et n'ont pas la même largeur, c'est déjà « chaque onglet a un look
    différent ». */
export const SETTINGS_MAX_WIDTH = "max-w-[1040px]";

/** Le temps que dure l'anneau : celui de poser l'œil, pas plus. */
const FOCUS_HIGHLIGHT_MS = 2000;
/** Au-delà, la section demandée n'arrivera pas (onglet sans elle, droits qui ne
 *  la rendent pas, requête en échec) : on cesse de la guetter. */
const FOCUS_WAIT_MS = 5000;

/**
 * Déroule jusqu'à la carte demandée et la surligne (MIN — recherche des
 * réglages dans ⌘K).
 *
 * Elle n'existe presque jamais à la frame où l'URL arrive : l'onglet vient de
 * changer, et la plupart des sections attendent une requête (membres, dépôt
 * lié, réglages du board). D'où la guette plutôt qu'un seul essai — sans elle,
 * une section sur deux ne recevait rien et l'utilisateur atterrissait en haut
 * de l'onglet, à chercher des yeux ce qu'il venait de nommer.
 */
function useSectionFocus(
  target: { id: SettingsSectionId; nonce: number } | null,
  reduceMotion: boolean,
) {
  useEffect(() => {
    if (!target) return;
    const domId = settingsSectionAnchor(target.id);
    const deadline = Date.now() + FOCUS_WAIT_MS;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let marked: HTMLElement | null = null;

    const look = () => {
      const el = document.getElementById(domId);
      if (!el) {
        if (Date.now() < deadline) frame = requestAnimationFrame(look);
        return;
      }
      el.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      el.setAttribute("data-settings-focus", "");
      marked = el;
      timer = setTimeout(
        () => el.removeAttribute("data-settings-focus"),
        FOCUS_HIGHLIGHT_MS,
      );
    };
    frame = requestAnimationFrame(look);

    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      marked?.removeAttribute("data-settings-focus");
    };
  }, [target, reduceMotion]);
}

/**
 * The settings layout shared by the account and project settings pages: a
 * centered, max-width column with a page header, an optional top slot, then a
 * left vertical tab rail (sticky on desktop) beside a content pane. Mirrors
 * AutoKap's SettingsShell. The active tab is driven by the `?tab=` query param
 * so tabs are deep-linkable and survive reloads; selecting the default tab
 * drops the param to keep the URL clean.
 */
export function SettingsShell({
  title,
  description,
  defaultTab,
  tabs,
  topSlot,
}: SettingsShellProps) {
  return (
    <div className={`mx-auto w-full ${SETTINGS_MAX_WIDTH} space-y-8 p-4 md:p-8`}>
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </header>

      {topSlot}

      {/* SettingsTabs reads `?tab=`; useSearchParams needs a Suspense boundary
          so the route can still be statically prerendered. */}
      <Suspense fallback={<div className="min-h-64" />}>
        <SettingsTabs defaultTab={defaultTab} tabs={tabs} />
      </Suspense>
    </div>
  );
}

function SettingsTabs({
  defaultTab,
  tabs,
}: {
  defaultTab: string;
  tabs: SettingsTab[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  // `layoutId` est GLOBAL à framer-motion : deux rails montés en même temps
  // (une transition de route qui superpose deux écrans) se voleraient la
  // pastille. Un id par instance ferme la porte.
  const pillId = `settings-tab-pill-${useId()}`;

  const visibleTabs = useMemo(() => tabs.filter((t) => !t.hidden), [tabs]);
  const validValues = useMemo(
    () => new Set(visibleTabs.map((t) => t.value)),
    [visibleTabs],
  );

  const tabParam = searchParams.get("tab");
  const fallback = validValues.has(defaultTab)
    ? defaultTab
    : (visibleTabs[0]?.value ?? defaultTab);
  const activeTab = tabParam && validValues.has(tabParam) ? tabParam : fallback;

  const setActiveTab = useCallback(
    (value: string) => {
      // Deux écrans partagent ce shell : les réglages du compte (/settings) et
      // ceux d'un projet (/projects/<id>/settings). Le chemin les distingue.
      trackEvent("settings_tab_switched", {
        scope: pathname.startsWith("/projects/") ? "project" : "account",
        tab: value,
      });
      const params = new URLSearchParams(searchParams.toString());
      if (value === fallback) {
        params.delete("tab");
      } else {
        params.set("tab", value);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [fallback, pathname, router, searchParams],
  );

  // `?section=` : la palette ne se contente pas d'ouvrir le bon onglet, elle
  // nomme la carte. Le paramètre est CONSOMMÉ dès sa lecture — recopié en état
  // local puis retiré de l'URL. Sans ce retrait, changer d'onglet le trimballe
  // (setActiveTab recopie la query) et un rechargement rejouerait le surlignage
  // d'une section qu'on ne cherche plus.
  const sectionParam = searchParams.get(SETTINGS_SECTION_PARAM);
  const [focus, setFocus] = useState<{
    id: SettingsSectionId;
    nonce: number;
  } | null>(null);
  const consumed = useRef<string | null>(null);

  useEffect(() => {
    if (!sectionParam) {
      consumed.current = null;
      return;
    }
    if (consumed.current === sectionParam) return;
    consumed.current = sectionParam;
    // Le compteur, et pas l'id seul : redemander DEUX FOIS la même section doit
    // la re-dérouler, or son id n'a pas changé.
    setFocus((prev) => ({
      id: sectionParam as SettingsSectionId,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
    const params = new URLSearchParams(searchParams.toString());
    params.delete(SETTINGS_SECTION_PARAM);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [sectionParam, searchParams, pathname, router]);

  useSectionFocus(focus, !!reduceMotion);

  return (
    <Tabs
      orientation="vertical"
      value={activeTab}
      onValueChange={setActiveTab}
      className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr] md:items-start md:gap-8"
    >
      <aside className="md:sticky md:top-4 md:self-start">
        {/* `variant="default"` : pastille pleine sur l'onglet actif. En `line`,
            l'actif ne se distinguait que par un filet de 2 px sur son bord droit
            — invisible à côté d'une colonne de cartes. */}
        <TabsList className="h-auto w-full items-stretch gap-0.5">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.value === activeTab;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                /* La pastille de l'onglet actif est dessinée ICI (voir plus bas),
                   pas par `data-active:bg-*` : une classe ne peut pas glisser
                   d'un onglet à l'autre, un élément partagé si. */
                className={cn(
                  "w-full justify-start gap-2 px-2.5 py-2",
                  "data-active:bg-transparent dark:data-active:bg-transparent",
                  "dark:data-active:border-transparent",
                  "group-data-[variant=default]/tabs-list:data-active:shadow-none",
                )}
              >
                {/* `layoutId` : une seule pastille montée à la fois, que
                    framer-motion fait GLISSER vers le nouvel onglet au lieu de
                    la faire disparaître ici et réapparaître là. */}
                {active && (
                  <motion.span
                    layoutId={pillId}
                    aria-hidden
                    className="absolute inset-0 rounded-md bg-background shadow-sm dark:border dark:border-input dark:bg-control"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 500, damping: 40 }
                    }
                  />
                )}
                {/* Positionné, donc peint AU-DESSUS de la pastille (même pile,
                    ordre du DOM) : sans ce span, l'absolu passerait par-dessus
                    le libellé, qui n'est pas positionné. */}
                <span className="relative flex min-w-0 flex-1 items-center gap-2">
                  {Icon && <Icon className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{tab.label}</span>
                  {tab.indicator && (
                    <span className="ml-auto flex items-center" title={tab.indicator}>
                      <span
                        className="size-1.5 rounded-full bg-amber-500"
                        aria-hidden
                      />
                      <span className="sr-only">{tab.indicator}</span>
                    </span>
                  )}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </aside>

      <div className="min-w-0">
        {visibleTabs.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            /* L'espacement vit désormais ENTRE les cartes : chaque groupe porte
               son propre cadre, l'ancien `space-y-10` (qui séparait des blocs
               sans bord) laisserait des trous. */
            className="mt-0 flex flex-col gap-4"
          >
            {tab.content}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
