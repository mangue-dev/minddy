"use client";

import { useRef, useState, useLayoutEffect, useCallback, useEffect, useId, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft01Icon, Cancel01Icon, Home01Icon, Menu01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/icon";
import Link from "@/components/app-link";
import { MobileNavActions } from "./mobile-nav-actions";
import { MobileSidebarReveal } from "./mobile-sidebar-reveal";
import { SidebarFrame, SidebarRows } from "./app-sidebar";
import { MobileSheetScrollArea } from "./ui/mobile-sheet";
import { type NavSection, type NavItem } from "mangue-ui";
import { useMobileSecondarySidebar } from "@/lib/secondary-sidebar-context";

export type MobileMenuPanel = {
  key: string;
  title: string;
  icon?: ReactNode;
  sidebarRoute?: string;
  sections?: MobileMenuSection[];
  render?: (navigation: MobileMenuNavigation) => ReactNode;
};
export type MobileMenuSection = Omit<NavSection, "items"> & {
  items: (NavItem & { panel?: MobileMenuPanel })[];
};
export type MobileMenuNavigation = { onBrowse: (panel: MobileMenuPanel) => void; onNavigate: () => void };

/** Branches browse within the sidebar; only final destinations leave it. */
export function MobileMenuRows({ sections, onBrowse, onNavigate }: { sections: MobileMenuSection[] } & MobileMenuNavigation) {
  return <SidebarRows sections={sections.map((section) => ({ ...section, items: section.items.map((item) => ({
    ...item, href: item.panel ? undefined : item.href, descends: !!item.panel, browseKey: item.panel?.key,
    onClick: item.panel ? () => onBrowse(item.panel!) : () => { onNavigate(); item.onClick?.(); },
  })) }))} />;
}

export function MobileNavigation({ sections, initialPanel, initialPanels, onSearch }: {
  sections: MobileMenuSection[];
  initialPanel?: MobileMenuPanel;
  initialPanels?: MobileMenuPanel[];
  onSearch: () => void;
}) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const pathname = usePathname();
  const sidebarId = useId();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panels, setPanels] = useState<MobileMenuPanel[]>([]);
  const panel = panels.at(-1);
  const secondary = useMobileSecondarySidebar();
  const onBrowse = useCallback((next: MobileMenuPanel) => setPanels((previous) => [...previous, next]), []);
  const onNavigate = useCallback(() => setMenuOpen(false), []);
  const onOpenChange = useCallback((next: boolean) => {
    if (next && !menuOpen) setPanels(initialPanels ?? (initialPanel ? [initialPanel] : []));
    setMenuOpen(next);
  }, [menuOpen, initialPanels, initialPanel]);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  const navigation: MobileMenuNavigation = {
    onBrowse,
    onNavigate,
  };
  useLayoutEffect(() => { if (menuOpen) heading.current?.focus({ preventScroll: true }); }, [panel?.key, menuOpen]);
  return <>
    <nav aria-label="Navigation" data-mobile-navigation className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] desktop:hidden">
      <div className="grid h-12 w-[min(100%-2rem,320px)] grid-cols-5 grid-rows-1 items-center rounded-full border border-border bg-background shadow-lg">
        <Link href="/home" aria-label={t("home")} aria-current={pathname === "/home" ? "page" : undefined} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Home01Icon} className="size-[22px]" /></Link>
        <button ref={menuTrigger} data-mobile-menu-trigger type="button" aria-label={t("goTo")} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => onOpenChange(true)} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Menu01Icon} className="size-[22px]" /></button>
        <button type="button" aria-label={t("searchPlaceholder")} onClick={onSearch} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Search01Icon} className="size-[22px]" /></button>
        <MobileNavActions />
      </div>
    </nav>
    <MobileSidebarReveal open={menuOpen} onOpenChange={onOpenChange} trigger={menuTrigger} heading={heading} label={t("goTo")}>
      <SidebarFrame id={sidebarId} mobile onNavigate={onNavigate}>
        <div data-mobile-sidebar-header className="flex min-h-14 shrink-0 items-center gap-2 px-2.5">
          {panels.length > 0 && <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-sidebar-accent"
            aria-label={tc("back")} onClick={() => setPanels((previous) => previous.slice(0, -1))}>
            <AppIcon icon={ArrowLeft01Icon} className="size-[18px]" />
          </button>}
          {panel?.icon && <span data-mobile-project-icon className="shrink-0" aria-hidden>{panel.icon}</span>}
          <h2 ref={heading} tabIndex={-1} className="min-w-0 flex-1 truncate text-sm font-medium outline-none">{panel?.title ?? t("goTo")}</h2>
          <button type="button" aria-label={tc("close")} onClick={onNavigate} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent"><AppIcon icon={Cancel01Icon} className="size-[18px]" /></button>
        </div>
        {panel?.sidebarRoute === pathname && secondary?.present ?
          <MobileCollectionMenu route={pathname} onNavigate={onNavigate} /> :
          <MobileSheetScrollArea key={panel?.key ?? "home"} className="space-y-4 px-2.5 pb-4">
            {panel?.render ? panel.render(navigation) : <MobileMenuRows sections={panel?.sections ?? sections} {...navigation} />}
          </MobileSheetScrollArea>}
      </SidebarFrame>
    </MobileSidebarReveal>
  </>;
}

/** The page keeps selection and filters while its navigation lives in the menu. */
function MobileCollectionMenu({ route, onNavigate }: { route: string; onNavigate: () => void }) {
  const secondary = useMobileSecondarySidebar();
  const [header, setHeader] = useState<HTMLDivElement | null>(null);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const setHost = secondary?.setMobileHost;
  useLayoutEffect(() => {
    if (!setHost || !header || !body) return;
    setHost({ route, header, body, onNavigate });
    return () => setHost(null);
  }, [setHost, route, header, body, onNavigate]);
  return <>
    <div ref={setHeader} data-mobile-collection-filter className="shrink-0 px-2.5 pb-2" />
    <MobileSheetScrollArea className="space-y-4 px-2.5 pb-4">
      <div ref={setBody} />
    </MobileSheetScrollArea>
  </>;
}
