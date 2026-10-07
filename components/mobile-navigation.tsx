"use client";

import { useRef, useState, useLayoutEffect, useCallback, useEffect, useId, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home01Icon, LayoutAlignLeftIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/icon";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { transitions } from "@/lib/motion";
import { SidebarPanelTransition } from "./sidebar-panel-transition";
import { SecondarySidebarHeader } from "@/components/secondary-sidebar";
import { matchesFilter } from "@/components/sidebar-filter-field";
import Link from "@/components/app-link";
import { MobileNavActions } from "./mobile-nav-actions";
import { MobileSidebarReveal } from "./mobile-sidebar-reveal";
import { SidebarFrame, SidebarRows, SidebarTopBand, SidebarBackRow, ProjectContextRow } from "./app-sidebar";
import { MobileSheetScrollArea } from "./ui/mobile-sheet";
import { type NavSection, type NavItem } from "mangue-ui";
import type { Project } from "@/lib/types";
import { useMobileSecondarySidebar } from "@/lib/secondary-sidebar-context";

export type MobileMenuPanel = {
  key: string;
  title: string;
  project?: Project;
  sidebarRoute?: string;
  sections?: MobileMenuSection[];
  render?: (navigation: MobileMenuNavigation) => ReactNode;
};
export type MobileMenuSection = Omit<NavSection, "items"> & {
  items: (NavItem & { panel?: MobileMenuPanel })[];
};
export type MobileMenuNavigation = { onBrowse: (panel: MobileMenuPanel) => void; onNavigate: () => void; headerHost?: HTMLElement | null };

/** Branches browse within the sidebar; only final destinations leave it. */
export function MobileMenuRows({ sections, onBrowse, onNavigate }: { sections: MobileMenuSection[] } & MobileMenuNavigation) {
  return <SidebarRows sections={sections.map((section) => ({ ...section, items: section.items.map((item) => ({
    ...item, href: item.panel ? undefined : item.href, descends: !!item.panel, browseKey: item.panel?.key,
    onClick: item.panel ? () => onBrowse(item.panel!) : () => { onNavigate(); item.onClick?.(); },
  })) }))} />;
}

export function MobileNavigation({ sections, initialPanel, initialPanels, projects = [], onSearch }: {
  sections: MobileMenuSection[];
  initialPanel?: MobileMenuPanel;
  initialPanels?: MobileMenuPanel[];
  projects?: Project[];
  onSearch: () => void;
}) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const pathname = usePathname();
  const sidebarId = useId();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<HTMLElement>(null);
  const [headerHost, setHeaderHost] = useState<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panels, setPanels] = useState<MobileMenuPanel[]>([]);
  const browsing = useRef(false);
  const panel = panels.at(-1);
  const secondary = useMobileSecondarySidebar();
  const reduce = useReducedMotion();
  const panelTransition = reduce ? { duration: 0 } : transitions.panel;
  const collectionPanel = (initialPanels ?? (initialPanel ? [initialPanel] : [])).find((item) => item.sidebarRoute === pathname);
  const showCollection = !!collectionPanel && panel?.key === collectionPanel.key && !!secondary?.present;
  const onBrowse = useCallback((next: MobileMenuPanel) => { browsing.current = true; setPanels((previous) => [...previous, next]); }, []);
  const onBack = useCallback(() => { browsing.current = true; setPanels((previous) => previous.slice(0, -1)); }, []);
  const onNavigate = useCallback(() => setMenuOpen(false), []);
  const onOpenChange = useCallback((next: boolean) => {
    if (next && !menuOpen) { browsing.current = false; setPanels(initialPanels ?? (initialPanel ? [initialPanel] : [])); }
    setMenuOpen(next);
  }, [menuOpen, initialPanels, initialPanel]);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (menuOpen && !browsing.current) setPanels(initialPanels ?? (initialPanel ? [initialPanel] : []));
  }, [menuOpen, initialPanels, initialPanel]);
  const navigation: MobileMenuNavigation = {
    onBrowse,
    onNavigate,
    headerHost,
  };
  useLayoutEffect(() => { if (menuOpen) focusTarget.current?.focus({ preventScroll: true }); }, [panel?.key, menuOpen]);
  return <>
    <nav aria-label="Navigation" data-mobile-navigation className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] desktop:hidden">
      <div className="grid h-12 w-[min(100%-2rem,320px)] grid-cols-5 grid-rows-1 items-center rounded-full border border-border bg-background shadow-lg">
        <Link href="/home" aria-label={t("home")} aria-current={pathname === "/home" ? "page" : undefined} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Home01Icon} className="size-[22px]" /></Link>
        <button ref={menuTrigger} data-mobile-menu-trigger type="button" aria-label={t("goTo")} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => onOpenChange(true)} className="flex h-full min-w-0 items-center justify-center rounded-full outline-none focus-visible:bg-muted"><AppIcon icon={LayoutAlignLeftIcon} className="size-[22px]" /></button>
        <button type="button" aria-label={t("searchPlaceholder")} onClick={onSearch} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Search01Icon} className="size-[22px]" /></button>
        <MobileNavActions />
      </div>
    </nav>
    <MobileSidebarReveal open={menuOpen} onOpenChange={onOpenChange} trigger={menuTrigger} focusTarget={focusTarget} label={t("goTo")}>
      <SidebarFrame id={sidebarId} mobile onNavigate={onNavigate} focusRef={focusTarget}>
        <SidebarTopBand secondary={!!panel && !panel.project} headerRef={setHeaderHost} onCreate={onNavigate} />
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {collectionPanel && secondary?.present && <motion.div
            data-mobile-sidebar-panel={collectionPanel.key}
            className="absolute inset-0 flex min-h-0 flex-col"
            inert={!showCollection} aria-hidden={!showCollection}
            initial={false}
            animate={{ opacity: showCollection ? 1 : 0, x: showCollection ? 0 : 16 }}
            transition={panelTransition}
            style={{ pointerEvents: showCollection ? "auto" : "none" }}>
            <SidebarBackRow label={collectionPanel.title} ariaLabel={tc("back")} onBack={onBack} />
            <MobileCollectionMenu route={pathname} active={showCollection} onNavigate={onNavigate} headerHost={headerHost} />
          </motion.div>}
          <AnimatePresence mode="sync" initial={false}>
            {!showCollection && <SidebarPanelTransition key={panel?.key ?? "home"}
              className="absolute inset-0 flex min-h-0 flex-col" offset={panel ? 16 : -16} transition={panelTransition}>
              <MobileBrowsePanel panel={panel} sections={sections} projects={projects} navigation={navigation} onBack={onBack}
                onProjectSelect={(project) => {
                  const next = sections.flatMap((section) => section.items).find((item) => item.panel?.project?.id === project.id)?.panel;
                  if (next) { browsing.current = true; setPanels([next]); }
                }} />
            </SidebarPanelTransition>}
          </AnimatePresence>
        </div>
      </SidebarFrame>
    </MobileSidebarReveal>
  </>;
}

/** Exiting levels keep their rows visible, but only the current level owns the filter band. */
function MobileBrowsePanel({ panel, sections, projects, navigation, onBack, onProjectSelect }: {
  panel?: MobileMenuPanel;
  sections: MobileMenuSection[];
  projects: Project[];
  navigation: MobileMenuNavigation;
  onBack: () => void;
  onProjectSelect: (project: Project) => void;
}) {
  const present = useIsPresent();
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const currentNavigation = { ...navigation, headerHost: present ? navigation.headerHost : null };
  return <div data-mobile-sidebar-panel={panel?.key ?? "home"} className="flex min-h-0 flex-1 flex-col">
    {!!panel && !panel.project && <SidebarBackRow label={panel.title} ariaLabel={tc("back")} onBack={onBack} />}
    <MobileSheetScrollArea className={`space-y-4 px-2.5 pb-2 ${!panel || panel.project ? "pt-[calc((var(--app-content-header-height)-2.25rem)/2)]" : ""}`}>
      {panel?.project && <ProjectContextRow
        homeItem={{ key: "home-back", label: t("home"), href: "/home" }} currentProject={panel.project} projects={projects}
        onBack={onBack} onProjectSelect={onProjectSelect} />}
      {panel?.render ? panel.render(currentNavigation) : panel && !panel.project ?
        <MobileStaticMenu sections={panel.sections ?? []} {...currentNavigation} /> :
        <MobileMenuRows sections={panel?.sections ?? sections} {...currentNavigation} />}
    </MobileSheetScrollArea>
  </div>;
}

/** Keep portal destinations mounted like desktop so browsing preserves page-owned state. */
function MobileCollectionMenu({ route, active, onNavigate, headerHost }: {
  route: string; active: boolean; onNavigate: () => void; headerHost: HTMLElement | null;
}) {
  const secondary = useMobileSecondarySidebar();
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [header, setHeader] = useState<HTMLDivElement | null>(null);
  const setHost = secondary?.setMobileHost;
  useLayoutEffect(() => {
    if (!setHost || !header || !body) return;
    setHost({ route, header, body, onNavigate });
    return () => setHost(null);
  }, [setHost, route, header, body, onNavigate]);
  return <>
    {headerHost && createPortal(<div ref={setHeader} hidden={!active} inert={!active} />, headerHost)}
    <MobileSheetScrollArea className="space-y-4 px-2.5 pb-2">
      <div ref={setBody} />
    </MobileSheetScrollArea>
  </>;
}

function MobileStaticMenu({ sections, headerHost, ...navigation }: { sections: MobileMenuSection[] } & MobileMenuNavigation) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const [query, setQuery] = useState("");
  const count = sections.reduce((total, section) => total + section.items.length, 0);
  return <>
    {headerHost && createPortal(<SecondarySidebarHeader filter={{ value: query, onChange: setQuery, placeholder: t("filterPlaceholder", { count }), clearLabel: tc("clearFilter") }} />, headerHost)}
    <MobileMenuRows sections={sections.map((section) => ({ ...section, items: section.items.filter((item) => matchesFilter(query, [item.label])) }))} {...navigation} />
  </>;
}
