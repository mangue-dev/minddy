"use client";

import { Suspense, useCallback, useId, useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from "mangue-ui";
import type { LucideIcon } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

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
