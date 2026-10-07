"use client";

import { useRef, useState, useLayoutEffect, useCallback, useEffect, useId, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home01Icon, Menu01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/icon";
import { createPortal } from "react-dom";
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
        <button ref={menuTrigger} data-mobile-menu-trigger type="button" aria-label={t("goTo")} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => onOpenChange(true)} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Menu01Icon} className="size-[22px]" /></button>
        <button type="button" aria-label={t("searchPlaceholder")} onClick={onSearch} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Search01Icon} className="size-[22px]" /></button>
        <MobileNavActions />
      </div>
    </nav>
    <MobileSidebarReveal open={menuOpen} onOpenChange={onOpenChange} trigger={menuTrigger} focusTarget={focusTarget} label={t("goTo")}>
      <SidebarFrame id={sidebarId} mobile onNavigate={onNavigate} focusRef={focusTarget}>
        <SidebarTopBand secondary={!!panel && !panel.project} headerRef={setHeaderHost} onCreate={onNavigate} />
        {!!panel && !panel.project && <SidebarBackRow label={panel.title} ariaLabel={tc("back")} onBack={onBack} />}
        {panel?.sidebarRoute === pathname && secondary?.present ?
          <MobileCollectionMenu route={pathname} onNavigate={onNavigate} headerHost={headerHost} /> :
          <MobileSheetScrollArea key={panel?.key ?? "home"} className={`space-y-4 px-2.5 pb-2 ${!panel || panel.project ? "pt-[calc((var(--app-content-header-height)-2.25rem)/2)]" : ""}`}>
            {panel?.project && <ProjectContextRow
              homeItem={{ key: "home-back", label: t("home"), href: "/home" }} currentProject={panel.project} projects={projects}
              onBack={onBack}
              onProjectSelect={(project) => {
                const next = sections.flatMap((section) => section.items).find((item) => item.panel?.project?.id === project.id)?.panel;
                if (next) { browsing.current = true; setPanels([next]); }
              }} />}
            {panel?.render ? panel.render(navigation) : panel && !panel.project ? <MobileStaticMenu key={panel.key} sections={panel.sections ?? []} {...navigation} /> : <MobileMenuRows sections={panel?.sections ?? sections} {...navigation} />}
          </MobileSheetScrollArea>}
      </SidebarFrame>
    </MobileSidebarReveal>
  </>;
}

/** The page keeps selection and filters while its navigation lives in the menu. */
function MobileCollectionMenu({ route, onNavigate, headerHost }: { route: string; onNavigate: () => void; headerHost: HTMLElement | null }) {
  const secondary = useMobileSecondarySidebar();
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const setHost = secondary?.setMobileHost;
  useLayoutEffect(() => {
    if (!setHost || !headerHost || !body) return;
    setHost({ route, header: headerHost, body, onNavigate });
    return () => setHost(null);
  }, [setHost, route, headerHost, body, onNavigate]);
  return <>
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
