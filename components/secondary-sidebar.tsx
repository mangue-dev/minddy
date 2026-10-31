"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { cn } from "@/lib/utils";
import { useSecondarySidebar } from "@/lib/secondary-sidebar-context";
import { SidebarFilterField } from "@/components/sidebar-filter-field";
import { isPlainNavigationClick } from "@/components/editor-node-link";
import { normalizeAppTabLocation } from "@/lib/app-tab-location";
import { IssueContextMenu, type ContextMenuAction } from "@/components/issue-context-menu";
import { useNavigationContextActions } from "@/components/navigation-context-actions";
import { composeSidebarContextActions } from "@/lib/sidebar-context-actions";

/**
 * Width of the column the primary sidebar takes when it hosts this bar
 * (MIN-546). Shared by the desktop fallback column (`app-desktop:w-80`).
 */
export const SECONDARY_WIDTH = 320;

/**
 * Registration must be done BEFORE painting: it is what decides whether the
 * primary sidebar swaps its nav for the back row + this bar. Passed by an
 * ordinary effect, we would see one level miss for the duration of an image
 * each time you navigate to a page with a secondary bar.
 */
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type SidebarMenuState = { x: number; y: number; href: string; target: Element | null };

/**
 * The right-click menu of a collection list, shared by every rendering of it
 * (route-owned desktop bar, mobile menu portal, browsed level): resolve the
 * row under the pointer, build its actions, and keep the shared navigation
 * entries between the object's actions and its destructive ones.
 */
function useCollectionContextMenu(
  itemContextActions: ((target: Element) => ContextMenuAction[]) | undefined,
  onItemContextMenu: ((target: Element | null) => void) | undefined,
) {
  const [menu, setMenu] = useState<SidebarMenuState | null>(null);
  const navigationActions = useNavigationContextActions(menu?.href);
  const actions = useMemo(
    () => composeSidebarContextActions(
      menu?.target ? itemContextActions?.(menu.target) ?? [] : [],
      navigationActions,
    ),
    [menu, itemContextActions, navigationActions],
  );
  const onContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>("a[href], [data-navigation-href]");
    if (!target || !event.currentTarget.contains(target)) return;
    const href = target.dataset.navigationHref ?? target.getAttribute("href");
    const destination = normalizeAppTabLocation(href);
    if (!destination) return;
    // The gesture opens the menu only: no selection, no navigation.
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, href: destination, target });
    onItemContextMenu?.(target);
  }, [onItemContextMenu]);
  const close = useCallback(() => {
    setMenu(null);
    onItemContextMenu?.(null);
  }, [onItemContextMenu]);
  return { menu, actions, onContextMenu, close };
}

/**
 * The navigation column of a page — list of pull requests, sessions
 * agent, sorting, returns. Written in the page (its selection state
 * drives the detail right next to it).
 *
 * Two renderings, one component:
 *
 * - **Desktop layout**: teleported INSIDE the primary sidebar (MIN-546) — the
 * filter/actions strip into the sidebar's top band, the item list right
 * below the back row. No resizing anywhere: the primary sidebar hosts it.
 * - **Mobile layout**: hosted in the revealed sidebar when its route is open.
 * Selection stays owned by the page; only the navigation moves into the menu.
 */
/** Whether a click landed on the column's empty space rather than on a row or
 *  a control. */
export function isBlankSidebarClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !target.closest(
    "button, a[href], input, textarea, select, [role=button], [role=menuitem], [data-sidebar-row], [data-sidebar-filter-result], [data-navigation-href]"
  );
}

export function SecondarySidebar({
  title,
  filter,
  actions,
  hiddenOnMobile,
  itemContextActions,
  onItemContextMenu,
  onBlankClick,
  children,
}: {
  /**
   * The name of the column. It is no longer WRITTEN on the title line — the
   * back row already carries the page name — but it remains the accessible
   * label of the pane, and the fallback when the page does not offer a
   * filter. Omitted by the route SKELETONS, who occupy the place of the bar
   * by the time the screen arrives so navigation never flashes.
   */
  title?: string;
  /**
   * The text filter of the list, which occupies the title line.
   *
   * Passed in data rather than `ReactNode`: the secondary bar screens must
   * offer the same gesture, in the same place, with the same appearance — a
   * `ReactNode` would let everyone reinvent their version.
   *
   * There is NO counter next to it: the number of elements is in the
   * placeholder (“Filter the 12 pull requests…”).
   */
  filter?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    clearLabel: string;
  };
  /** Actions of the title line (filters, creation button, etc.), pushed to the right. */
  actions?: ReactNode;
  /**
   * Hide the inline mobile fallback when navigation belongs to the menu.
   * No effect on desktop or on the mobile menu portal.
   */
  hiddenOnMobile?: boolean;
  /**
   * Row-level actions for the right-click menu, built from the row the
   * pointer landed on. Merged ABOVE the shared “open in a new tab / copy
   * link” entries, which always close the menu.
   */
  itemContextActions?: (target: Element) => ContextMenuAction[];
  /**
   * Told which row's menu opened (`null` once it closed), for lists whose
   * actions depend on a read started at that moment. The menu re-reads
   * `itemContextActions` whenever the caller passes a new one.
   */
  onItemContextMenu?: (target: Element | null) => void;
  /**
   * A click on the column's empty space, outside every row and control
   * (MIN-873): the lists clear their multi-selection with it.
   */
  onBlankClick?: () => void;
  children: ReactNode;
}) {
  const { headerSlot, slot, register, hosting, mobileHost } = useSecondarySidebar();
  const pathname = usePathname();
  const isMobileLayout = useMobileLayout() === true;
  // Nothing in the server rendering: the space is reserved by the primary
  // sidebar's route-level panel anyway (routeHasSecondaryNav), and
  // teleporting before knowing where it goes would diverge the hydration.
  const [mounted, setMounted] = useState(false);
  const {
    menu: navigationMenu,
    actions: menuActions,
    onContextMenu,
    close: closeMenu,
  } = useCollectionContextMenu(itemContextActions, onItemContextMenu);

  useIsoLayoutEffect(() => {
    setMounted(true);
    return register();
  }, [register]);
  useEffect(() => {
    // The menu portals to body, outside the hidden panel's inert subtree.
    if (!isMobileLayout && !hosting) closeMenu();
  }, [hosting, isMobileLayout, closeMenu]);

  if (!mounted) return null;

  const hoisted =
    !isMobileLayout && slot !== null && headerSlot !== null;

  /**
   * The title line COMMANDS the column, it does not name it: the filter
   * of the list, what restricts it, what can be created there.
   */
  const header = <SecondarySidebarHeader title={title} filter={filter} actions={actions} />;

  const body = (
    <aside
      aria-label={title}
      data-sidebar-navigation
      className="flex min-h-0 flex-1 flex-col"
      onContextMenu={onContextMenu}
      onClick={(event) => {
        if (onBlankClick && isBlankSidebarClick(event.target)) onBlankClick();
      }}
    >
      <div className="scrollbar-quiet flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </aside>
  );

  if (isMobileLayout && mobileHost?.route === pathname) {
    return <>
      {createPortal(header, mobileHost.header)}
      {createPortal(<div data-mobile-collection-navigation onContextMenu={onContextMenu} onClick={(event) => {
        if (event.defaultPrevented || !(event.target instanceof Element)) return;
        if (event.target.closest("a[href], [data-navigation-href], [data-sidebar-navigation-item]")) mobileHost.onNavigate();
      }}>{children}</div>, mobileHost.body)}
      <IssueContextMenu position={navigationMenu} onClose={closeMenu} actions={menuActions} searchable={false} />
    </>;
  }

  if (hoisted) {
    return (
      <>
        {createPortal(header, headerSlot)}
        {createPortal(
          <>
            {body}
            <IssueContextMenu
              position={hosting ? navigationMenu : null}
              onClose={closeMenu}
              actions={menuActions}
              searchable={false}
            />
          </>,
          slot,
        )}
      </>
    );
  }

  // The stable desktop portal remains mounted while browsing upper levels.
  // Before its destination exists, keep the bar out of the page's layout.
  if (!isMobileLayout && !hosting) return null;

  return (
    <aside
      aria-label={title}
      data-sidebar-navigation
      className={cn(
        "min-h-0 flex-col border-border",
        "w-full shrink-0 app-desktop:flex app-desktop:w-80 app-desktop:border-r",
        hiddenOnMobile ? "hidden" : "flex",
      )}
      onContextMenu={onContextMenu}
    >
      {header}
      <div className="scrollbar-quiet flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
      <IssueContextMenu
        position={navigationMenu}
        onClose={closeMenu}
        actions={menuActions}
        searchable={false}
      />
    </aside>
  );
}

/** The same filter/action band is used by route-owned and browsed mobile lists. */
export function SecondarySidebarHeader({ title, filter, actions }: {
  title?: string;
  filter?: { value: string; onChange: (value: string) => void; placeholder: string; clearLabel: string };
  actions?: ReactNode;
}) {
  return (
    <div className="secondary-sidebar-header flex h-[var(--app-content-header-height)] shrink-0 items-center gap-2 border-b border-border pr-2.5 pl-[19px]">
      {filter ? (
        <SidebarFilterField {...filter} />
      ) : title ? (
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold tracking-tight">
          {title}
        </h1>
      ) : (
        <div className="flex-1" />
      )}
      {actions ? (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}
    </div>
  );
}


/** Browsing shares the actual collection UI without registering a second route sidebar. */
export type SidebarBrowseTarget = {
  headerHost?: HTMLElement | null;
  onSelect: (href: string) => void;
};

export function CollectionSidebar({ browse, children, ...props }: ComponentProps<typeof SecondarySidebar> & {
  browse?: SidebarBrowseTarget;
}) {
  if (!browse) return <SecondarySidebar {...props}>{children}</SecondarySidebar>;
  return <BrowsedCollection browse={browse} {...props}>{children}</BrowsedCollection>;
}

/** A collection shown while browsing another level: same rows, same right-click menu. */
function BrowsedCollection({ browse, children, ...props }: ComponentProps<typeof SecondarySidebar> & {
  browse: SidebarBrowseTarget;
}) {
  const { menu, actions, onContextMenu, close } = useCollectionContextMenu(props.itemContextActions, props.onItemContextMenu);
  return <>
    {browse.headerHost && createPortal(<SecondarySidebarHeader title={props.title} filter={props.filter} actions={props.actions} />, browse.headerHost)}
    <div data-sidebar-browse-collection onClickCapture={(event) => {
      if (!isPlainNavigationClick(event) || !(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>("[data-navigation-href], a[href]");
      if (!target || !event.currentTarget.contains(target)) return;
      const href = normalizeAppTabLocation(target.dataset.navigationHref ?? target.getAttribute("href"));
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      browse.onSelect(href);
    }} onContextMenu={onContextMenu}>{children}</div>
    <IssueContextMenu position={menu} onClose={close} actions={actions} searchable={false} />
  </>;
}
