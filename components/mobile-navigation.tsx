"use client";

import { useRef, useState, useLayoutEffect, useCallback, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft01Icon, ArrowRight01Icon, Home01Icon, Menu01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/icon";
import Link from "@/components/app-link";
import { MobileNavActions } from "./mobile-nav-actions";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { MobileSheetScrollArea } from "./ui/mobile-sheet";
import { cn, type NavSection, type NavItem } from "mangue-ui";
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

/** Branches browse in the sheet; only final links/actions leave it. */
export function MobileMenuRows({ sections, onBrowse, onNavigate }: { sections: MobileMenuSection[] } & MobileMenuNavigation) {
  return <>{sections.map((section, index) => <section key={section.key ?? index}>
    {section.label && <h2 className="mb-1 px-3 text-xs font-medium text-muted-foreground">{section.label}</h2>}
    {section.items.map((item) => {
      const Icon = item.icon;
      const content = <>{Icon && <Icon className="size-5 shrink-0" />}<span className="min-w-0 flex-1 truncate">{item.label}</span>{item.badge}{item.panel && <AppIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground" />}</>;
      const className = cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-control-hover", item.active && "bg-control", item.disabled && "opacity-50");
      if (item.panel) return <button type="button" key={item.key} className={className} disabled={item.disabled}
        data-mobile-menu-branch={item.panel.key} onClick={() => onBrowse(item.panel!)}>{content}</button>;
      const onClick = () => { onNavigate(); item.onClick?.(); };
      return item.href && !item.disabled ? <Link key={item.key} href={item.href} className={className} aria-current={item.active ? "page" : undefined} onClick={onClick}>{content}</Link>
        : <button type="button" key={item.key} className={className} onClick={onClick} disabled={item.disabled}>{content}</button>;
    })}
  </section>)}</>;
}

export function MobileNavigation({ sections, initialPanel, initialPanels, menuFooter, onSearch }: {
  sections: MobileMenuSection[];
  initialPanel?: MobileMenuPanel;
  initialPanels?: MobileMenuPanel[];
  menuFooter: ReactNode;
  onSearch: () => void;
}) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const pathname = usePathname();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panels, setPanels] = useState<MobileMenuPanel[]>([]);
  const panel = panels.at(-1);
  const secondary = useMobileSecondarySidebar();
  const onBrowse = useCallback((next: MobileMenuPanel) => setPanels((previous) => [...previous, next]), []);
  const onNavigate = useCallback(() => setMenuOpen(false), []);
  const navigation: MobileMenuNavigation = {
    onBrowse,
    onNavigate,
  };
  useLayoutEffect(() => { if (menuOpen) heading.current?.focus({ preventScroll: true }); }, [panel?.key, menuOpen]);
  return <>
    <nav aria-label="Navigation" data-mobile-navigation className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] desktop:hidden">
      <div className="grid h-12 w-[min(100%-2rem,320px)] grid-cols-5 grid-rows-1 items-center rounded-full border border-border bg-background shadow-lg">
        <Link href="/home" aria-label={t("home")} aria-current={pathname === "/home" ? "page" : undefined} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Home01Icon} className="size-[22px]" /></Link>
        <button ref={menuTrigger} data-mobile-menu-trigger type="button" aria-label={t("goTo")} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => { setPanels(initialPanels ?? (initialPanel ? [initialPanel] : [])); setMenuOpen(true); }} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Menu01Icon} className="size-[22px]" /></button>
        <button type="button" aria-label={t("searchPlaceholder")} onClick={onSearch} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Search01Icon} className="size-[22px]" /></button>
        <MobileNavActions />
      </div>
    </nav>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
      <DialogContent className="mobile-menu-sheet" aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); menuTrigger.current?.focus(); }}>
        <div data-mobile-sheet-header className="flex shrink-0 items-center gap-2 pr-10">
          {panels.length > 0 && <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-control-hover"
            aria-label={tc("back")} onClick={() => setPanels((previous) => previous.slice(0, -1))}>
            <AppIcon icon={ArrowLeft01Icon} className="size-5" />
          </button>}
          {panel?.icon && <span data-mobile-project-icon className="shrink-0" aria-hidden>{panel.icon}</span>}
          <DialogTitle ref={heading} tabIndex={-1} className="min-w-0 truncate outline-none">{panel?.title ?? t("goTo")}</DialogTitle>
        </div>
        {panel?.sidebarRoute === pathname && secondary?.present ?
          <MobileCollectionMenu route={pathname} onNavigate={onNavigate} menuFooter={menuFooter} /> :
        <MobileSheetScrollArea key={panel?.key ?? "home"} className="min-h-0 space-y-4 overflow-y-auto overscroll-contain">
          {panel?.render ? panel.render(navigation) : <MobileMenuRows sections={panel?.sections ?? sections} {...navigation} />}
          {menuFooter}
        </MobileSheetScrollArea>}
      </DialogContent>
    </Dialog>
  </>;
}

/** The page keeps selection and filters while its navigation lives in the menu. */
function MobileCollectionMenu({ route, onNavigate, menuFooter }: { route: string; onNavigate: () => void; menuFooter: ReactNode }) {
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
    <div ref={setHeader} data-mobile-collection-filter className="shrink-0" />
    <MobileSheetScrollArea className="space-y-4">
      <div ref={setBody} />
      {menuFooter}
    </MobileSheetScrollArea>
  </>;
}
