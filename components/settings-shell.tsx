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
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, cn } from "mangue-ui";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { useScrollFade } from "@/lib/use-scroll-fade";
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
  defaultTab: string;
  tabs: SettingsTab[];
  /** Rendered above the tab content (banners, warnings…). */
  topSlot?: ReactNode;
};

/** La largeur de la colonne de cartes, la MÊME des deux côtés (MIN-167). Le
    compte tenait en 880 px et le projet en 1080 : deux écrans qui partagent un
    shell et n'ont pas la même largeur, c'est déjà « chaque onglet a un look
    différent ». Depuis que le rail d'onglets est sorti dans la sidebar
    secondaire, c'est `max-w-3xl` — la même colonne centrée que le détail d'un
    triage, d'un retour ou d'une pull request. */
const SETTINGS_MAX_WIDTH = "max-w-3xl";

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
 * L'écran de réglages, partagé par le compte (/settings) et un projet
 * (/projects/<id>/settings). Le rail d'onglets est une SIDEBAR SECONDAIRE : il
 * quitte la colonne de contenu pour la colonne de navigation, pleine hauteur, à
 * gauche du header — la même place et la même grammaire que la liste du triage,
 * des retours, des pull requests et des sessions d'agent. Le titre de l'écran
 * est la ligne de titre de cette barre ; il n'est donc plus écrit au-dessus des
 * cartes, où il faisait doublon avec le fil d'Ariane.
 *
 * L'onglet actif est piloté par `?tab=` : les onglets sont partageables et
 * survivent à un rechargement ; choisir l'onglet par défaut retire le paramètre
 * pour garder l'URL propre.
 */
export function SettingsShell({ title, defaultTab, tabs, topSlot }: SettingsShellProps) {
  return (
    // SettingsTabs reads `?tab=`; useSearchParams needs a Suspense boundary
    // so the route can still be statically prerendered.
    <Suspense fallback={<div className="min-h-64" />}>
      <SettingsTabs
        title={title}
        defaultTab={defaultTab}
        tabs={tabs}
        topSlot={topSlot}
      />
    </Suspense>
  );
}

function SettingsTabs({
  title,
  defaultTab,
  tabs,
  topSlot,
}: {
  title: string;
  defaultTab: string;
  tabs: SettingsTab[];
  topSlot?: ReactNode;
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

  // Sous `md`, le rail et le contenu se relaient en plein écran, comme partout
  // ailleurs dans l'app. Une URL qui NOMME son onglet ouvre directement le
  // contenu : on arrive de la palette ou d'un lien, pas du rail.
  const [mobileDetail, setMobileDetail] = useState(!!tabParam);
  const contentFade = useScrollFade<HTMLDivElement>();
  const activeLabel =
    visibleTabs.find((t) => t.value === activeTab)?.label ?? title;

  const setActiveTab = useCallback(
    (value: string) => {
      setMobileDetail(true);
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
    // La racine des Tabs est la RANGÉE de l'écran : le rail part dans la sidebar
    // secondaire (par portail, donc toujours sous ce `Tabs` côté React — le
    // contexte Radix passe, les flèches du clavier aussi) et les cartes restent
    // à droite.
    <Tabs
      orientation="vertical"
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex h-full min-h-0 gap-0"
    >
      <SecondarySidebar title={title} hiddenOnMobile={mobileDetail}>
        {/* `variant="default"` : pastille pleine sur l'onglet actif. En `line`,
            l'actif ne se distinguait que par un filet de 2 px sur son bord droit
            — invisible à côté d'une colonne de cartes. La gouttière de 8 px et
            les coins arrondis sont ceux des autres sidebars secondaires.

            `flex-col` EN CLAIR, et pas via l'orientation des Tabs : mangue-ui
            empile la liste avec `group-data-vertical/tabs:flex-col`, un
            sélecteur de DESCENDANCE. Or le portail sort cette liste du DOM du
            `<Tabs>` — le contexte React la suit, la variante CSS non, et les
            onglets repartaient en ligne. Même raison pour le `w-full
            justify-start` posé sur chaque onglet plus bas. */}
        <TabsList className="h-auto w-full flex-col items-stretch gap-1 rounded-none bg-transparent p-0 px-2 pt-2 pb-4">
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
                  "w-full justify-start gap-2 rounded-lg px-3 py-2.5",
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
                    className="absolute inset-0 rounded-lg bg-muted"
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
      </SecondarySidebar>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {/* En-tête du panneau, MOBILE seulement : le retour vers le rail et le
            nom de l'onglet ouvert. Sur desktop le rail est à l'écran et le
            surligne déjà — une barre de plus n'aurait rien à dire, et pousserait
            les cartes vers le bas pour le répéter. */}
        <div className="flex shrink-0 items-center gap-2 px-4 py-3 md:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={title}
            onClick={() => setMobileDetail(false)}
          >
            <ChevronLeft />
          </Button>
          <span className="truncate text-sm font-medium">{activeLabel}</span>
        </div>

        <div
          ref={contentFade.ref}
          {...contentFade.scrollProps}
          className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-8 md:px-6 md:pt-6"
        >
          <div className={cn("mx-auto flex flex-col gap-4", SETTINGS_MAX_WIDTH)}>
            {topSlot}
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
        </div>
      </div>
    </Tabs>
  );
}
