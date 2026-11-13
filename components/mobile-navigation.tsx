"use client";

import { memo, useRef, useState, useLayoutEffect, useCallback, useEffect, useId, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { InboxIcon, Menu09Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/icon";
import { createPortal } from "react-dom";
import { SecondarySidebarHeader } from "@/components/secondary-sidebar";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { MobileCreateButton, MobileNumoButton } from "./mobile-nav-actions";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { MobileSheetContent } from "@/components/ui/mobile-sheet";
import { openInbox } from "@/lib/inbox-launcher";
import { MobileSheetScrollArea } from "./ui/mobile-sheet";
import { SidebarFrame, SidebarRows, type SidebarBackBadge } from "./app-sidebar";
import Link from "@/components/app-link";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { SearchSelect } from "@/components/search-select";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { defaultCreateProjectId, lastCreateProjectId } from "@/lib/last-create-project";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import type { NavSection, NavItem } from "@/components/nav-types";
import type { Project } from "@/lib/types";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { useMobileSecondarySidebar } from "@/lib/secondary-sidebar-context";
import { getMobileBridge } from "@/lib/mobile/bridge";
import { syncNativeNavigationBar } from "@/lib/mobile/native-navigation";
import { watchSideChrome } from "@/lib/mobile/side-chrome";

export type MobileMenuPanel = {
  key: string;
  title: string;
  project?: Project;
  sidebarRoute?: string;
  sections?: MobileMenuSection[];
  render?: (navigation: MobileMenuNavigation) => ReactNode;
  /** The badge of the level this panel's back row returns to (MIN-695). */
  backBadge?: SidebarBackBadge;
};
export type MobileMenuSection = Omit<NavSection, "items"> & {
  items: (NavItem & { panel?: MobileMenuPanel; contextActions?: ContextMenuAction[] })[];
};
export type MobileMenuNavigation = { onBrowse: (panel: MobileMenuPanel) => void; onNavigate: () => void; headerHost?: HTMLElement | null };

// Memoized like the desktop sidebar: it is mounted (and hidden) on desktop too.
/**
 * A slot of the bottom bar. No focus style of its own: closing the sidebar or
 * the palette hands the focus back here by script, and after a swipe the
 * browser counts that as visible focus, which painted the button gray. The
 * global keyboard ring (app/globals.css) still shows while Tab drives focus.
 */
const NAV_SLOT = "flex h-full min-w-0 items-center justify-center rounded-full outline-none";

type SheetTab = "goTo" | "page";

/**
 * The bottom bar, and the navigation sheet its menu button opens.
 *
 * The sheet is FLAT (MIN-959): one level, which always opens the same way.
 * The desktop sidebar's drill-down (home → project → collection, with back
 * rows) lost people on a phone, so here every row is a destination: a
 * project picker over that project's sections as tiles, then the app's own
 * destinations. The picker starts on the page's project, else the last one
 * an issue was created in; changing it changes the tiles, not the page. When
 * the current page has its own list (objectives, triage, settings…), a
 * second tab of the sheet holds it, and the sheet opens on that tab.
 */
export const MobileNavigation = memo(function MobileNavigation({ sections, initialPanel, initialPanels, inboxCount = 0, inboxBadgeLabel, onSearch }: {
  sections: MobileMenuSection[];
  /** Where the page sits: its project's panel, then the page's own list. */
  initialPanel?: MobileMenuPanel;
  initialPanels?: MobileMenuPanel[];
  projects?: Project[];
  /** Home's aggregate badge and its scope (the desktop sidebar's back rows). */
  homeBadge?: ReactNode;
  homeBadgeLabel?: string;
  /** What waits in the inbox: unread notifications and pending invitations. */
  inboxCount?: number;
  inboxBadgeLabel?: string;
  onSearch: () => void;
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const sidebarId = useId();
  const focusTarget = useRef<HTMLElement>(null);
  const [headerHost, setHeaderHost] = useState<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<SheetTab>("goTo");
  const [pickedProjectId, setPickedProjectId] = useState<string | null>(null);
  const secondary = useMobileSecondarySidebar();
  const routePanels = initialPanels ?? (initialPanel ? [initialPanel] : []);
  const projectPanel = routePanels.find((panel) => panel.project);
  // The page's own list: the route's panel that is not its project. When the
  // page mounts that list itself, the sheet hosts it; otherwise the panel
  // renders its own copy.
  const pagePanel = routePanels.find((panel) => !panel.project);
  const hostsRouteList = !!pagePanel && pagePanel.sidebarRoute === pathname && !!secondary?.present;
  const hasPageTab = !!pagePanel && (hostsRouteList || !!pagePanel.render || !!pagePanel.sections);
  // Every project's panel, in the sidebar's order; the section that listed
  // them (with the drafts and "New project", also in the + menu) leaves the
  // sheet for the picker.
  const projectPanels = sections.flatMap((section) => section.items).flatMap((item) => item.panel?.project ? [item.panel] : []);
  const destinations = sections.filter((section) => !section.items.some((item) => item.panel?.project || item.key === "new-project"));
  const shownProjectPanel = projectPanels.find((panel) => panel.project!.id === pickedProjectId)
    ?? projectPanel ?? projectPanels.find((panel) => panel.project!.id === defaultCreateProjectId(projectPanels.map((panel) => panel.project!), lastCreateProjectId()));
  const onNavigate = useCallback(() => setMenuOpen(false), []);
  const onOpenChange = useCallback((next: boolean) => {
    // Opened on a page with its own list (settings, objectives…), the sheet
    // shows that list first: it is what the page navigates. What was browsed
    // last time is not kept.
    if (next) { setTab(hasPageTab ? "page" : "goTo"); setPickedProjectId(null); }
    setMenuOpen(next);
  }, [hasPageTab]);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useLayoutEffect(() => { if (menuOpen) focusTarget.current?.focus({ preventScroll: true }); }, [menuOpen, tab]);
  const typing = useTypingInField();
  // In the mobile app the shell draws this bar natively, over this one
  // (lib/mobile/native-navigation.ts).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const shell = getMobileBridge()?.shell;
    if (!shell || !navRef.current) return;
    return syncNativeNavigationBar(navRef.current, shell) ?? undefined;
  }, []);
  // Where the system's controls stand on a side (iPhone Duo), the bar stands
  // there too, vertical (lib/mobile/side-chrome.ts, app/globals.css).
  useEffect(() => watchSideChrome(document), []);
  const inboxLabel = inboxCount > 0 && inboxBadgeLabel ? `${t("inbox")} — ${inboxBadgeLabel}` : t("inbox");
  const pageNavigation: MobileMenuNavigation = { onBrowse: () => {}, onNavigate, headerHost: tab === "page" ? headerHost : null };
  return <>
    <nav ref={navRef} aria-label={t("mainNavigation")} data-mobile-navigation data-typing={typing ? "" : undefined} className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] app-desktop:hidden">
      <div className="grid h-12 w-[min(100%-2rem,320px)] grid-cols-5 grid-rows-1 items-center rounded-full border border-border bg-background shadow-lg">
        {/* The menu first: it opens the navigation sheet, where the account
            and every destination live. The inbox takes Home's former slot. */}
        <button data-mobile-menu-trigger data-nav-slot="menu" type="button" aria-label={t("goTo")} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => onOpenChange(true)} className={NAV_SLOT}><AppIcon icon={Menu09Icon} className="size-[22px]" /></button>
        <button type="button" data-nav-slot="search" aria-label={t("searchPlaceholder")} onClick={onSearch} className={NAV_SLOT}><AppIcon icon={Search01Icon} className="size-[22px]" /></button>
        <button type="button" data-nav-slot="inbox" data-nav-badge={inboxCount > 0 ? "" : undefined} aria-label={inboxLabel} onClick={openInbox} className={`${NAV_SLOT} relative`}>
          <AppIcon icon={InboxIcon} className="size-[22px]" />
          {inboxCount > 0 && <span aria-hidden className="absolute top-2.5 right-[calc(50%-14px)] size-2 rounded-full bg-primary ring-2 ring-background" />}
        </button>
        <MobileNumoButton />
        <MobileCreateButton />
      </div>
      {/* The progressive blur behind the pill, over what scrolls under it.
          After the pill: the native bar reads the pill as the first child
          (lib/mobile/native-navigation.ts). */}
      <div data-mobile-nav-blur aria-hidden />
    </nav>
    <Sheet open={menuOpen} onOpenChange={onOpenChange}>
      <MobileSheetContent side="bottom" aria-describedby={undefined} className="mobile-nav-sheet">
        <SheetTitle className="sr-only">{t("goTo")}</SheetTitle>
        <SidebarFrame id={sidebarId} mobile onNavigate={onNavigate} focusRef={focusTarget}>
          {hasPageTab && <div data-mobile-nav-tabs className="shrink-0 px-2.5 pb-2">
            <SegmentedControl<SheetTab>
              options={[{ value: "goTo", label: t("goTo") }, { value: "page", label: pagePanel!.title }]}
              value={tab} onChange={setTab} ariaLabel={t("goTo")} className="w-full" />
          </div>}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* The page's list stays mounted while the other tab shows: the
                page owns its selection and filters, and keeps them. */}
            {hasPageTab && <div data-mobile-sidebar-panel="page" hidden={tab !== "page"} inert={tab !== "page"} className="flex min-h-0 flex-1 flex-col [&[hidden]]:hidden">
              <div ref={setHeaderHost} className="shrink-0 empty:hidden" />
              {hostsRouteList
                ? <MobileCollectionMenu route={pathname} active={tab === "page"} onNavigate={onNavigate} headerHost={headerHost} />
                : <MobileSheetScrollArea className="space-y-4 px-2.5 pb-2">
                  {pagePanel!.render ? pagePanel!.render(pageNavigation) : <MobileStaticMenu sections={pagePanel!.sections ?? []} {...pageNavigation} />}
                </MobileSheetScrollArea>}
            </div>}
            <div data-mobile-sidebar-panel="goTo" hidden={tab !== "goTo"} inert={tab !== "goTo"} className="flex min-h-0 flex-1 flex-col [&[hidden]]:hidden">
              <MobileSheetScrollArea className="space-y-4 px-2.5 pt-1 pb-2">
                {shownProjectPanel?.project && <ProjectTiles project={shownProjectPanel.project}
                  projects={projectPanels.map((panel) => panel.project!)} onPickProject={setPickedProjectId}
                  items={shownProjectPanel.sections?.flatMap((section) => section.items) ?? []} onNavigate={onNavigate} />}
                <MobileMenuRows sections={destinations} onNavigate={onNavigate} />
              </MobileSheetScrollArea>
            </div>
          </div>
        </SidebarFrame>
      </MobileSheetContent>
    </Sheet>
  </>;
});

/** Where a row leads: its own link, or the page of the panel it used to open. */
function destinationOf(item: MobileMenuSection["items"][number]): string | undefined {
  return item.panel?.sidebarRoute ?? item.href;
}

/** Every row is a destination: nothing in this sheet opens a level below. */
export function MobileMenuRows({ sections, onNavigate }: { sections: MobileMenuSection[]; onNavigate: () => void }) {
  return <SidebarRows sections={sections.map((section) => ({ ...section, items: section.items.map((item) => ({
    ...item, href: destinationOf(item), descends: false,
    onClick: () => { onNavigate(); item.onClick?.(); },
  })) }))} />;
}

/**
 * A project's sections as tiles, under a picker of the projects: the place
 * people move most within, in reach of a thumb, with what waits in triage and
 * feedback. The picker is the board's view picker, applied to projects.
 */
function ProjectTiles({ project, projects, onPickProject, items, onNavigate }: {
  project: Project;
  projects: Project[];
  onPickProject: (projectId: string) => void;
  items: MobileMenuSection["items"];
  onNavigate: () => void;
}) {
  const t = useTranslations("Nav");
  const tCreation = useTranslations("Creation");
  const orb = (item: Project) => <ProjectOrb seed={projectOrbSeed(item)} iconUrl={item.icon_url} className="size-4 rounded-[5px]" />;
  return <section data-mobile-project-tiles aria-label={project.name}>
    <div className="pb-2">
      <SearchSelect
        value={project.id}
        onChange={(id) => { if (id) onPickProject(id); }}
        options={projects.map((item) => ({ value: item.id, label: item.name, icon: orb(item) }))}
        searchPlaceholder={tCreation("searchProject")}
        trigger={<button type="button" data-mobile-project-picker aria-label={t("switchProject")}
          className="flex h-11 max-w-full items-center gap-2 rounded-full px-3 text-sm font-medium outline-none hover:bg-sidebar-accent focus-visible:bg-sidebar-accent">
          {orb(project)}
          <span className="truncate">{project.name}</span>
          <AppIcon icon={ArrowDown01Icon} className="size-4 shrink-0 text-sidebar-foreground/60" />
        </button>}
      />
    </div>
    <ul className="grid grid-cols-3 gap-2">
      {items.map((item) => {
        const href = destinationOf(item);
        const Icon = item.icon;
        if (!href) return null;
        return <li key={item.key}>
          <Link href={href} onClick={onNavigate} aria-current={item.active ? "page" : undefined} data-sidebar-navigation-item
            className={cn("relative flex h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-xs font-medium outline-none transition-colors",
              item.active ? "bg-sidebar-accent text-sidebar-foreground" : "bg-sidebar-accent/40 text-sidebar-foreground/75 active:bg-sidebar-accent")}>
            {Icon && <Icon className="size-5 shrink-0" />}
            {/* Under the project's name, its settings need no "project". */}
            <span className="max-w-full truncate">{item.key === "settings" ? t("settings") : item.label}</span>
            {item.badge && <span className="absolute top-1.5 right-2">{item.badge}</span>}
          </Link>
        </li>;
      })}
    </ul>
  </section>;
}

/** Keep portal destinations mounted like desktop so the page keeps its own state. */
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

function MobileStaticMenu({ sections, headerHost, onNavigate }: { sections: MobileMenuSection[] } & MobileMenuNavigation) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const [query, setQuery] = useState("");
  const count = sections.reduce((total, section) => total + section.items.length, 0);
  return <>
    {headerHost && createPortal(<SecondarySidebarHeader filter={{ value: query, onChange: setQuery, placeholder: t("filterPlaceholder", { count }), clearLabel: tc("clearFilter") }} />, headerHost)}
    <MobileMenuRows sections={sections.map((section) => ({ ...section, items: section.items.filter((item) => matchesFilter(query, [item.label])) }))} onNavigate={onNavigate} />
  </>;
}

/** A text field has the focus — a page title, a comment, a search field — so
    the keyboard is up and the bottom navigation would only cover the text. */
function isTextField(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable || element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement &&
    !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"].includes(element.type);
}

function useTypingInField(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    // `focusout` fires before the next field takes the focus: read the active
    // element once the move is over.
    const update = () => queueMicrotask(() => setTyping(isTextField(document.activeElement)));
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    // A focused field removed with its sheet (the palette swiped away) sends
    // no focusout in WebKit: the bar stayed hidden until the next tap
    // (MIN-907). Layers mount and leave as children of the body.
    const layers = new MutationObserver(update);
    layers.observe(document.body, { childList: true });
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      layers.disconnect();
    };
  }, []);
  return typing;
}
