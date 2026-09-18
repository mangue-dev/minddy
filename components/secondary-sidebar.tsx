"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn, useMediaQuery } from "mangue-ui";
import { useSecondarySidebar } from "@/lib/secondary-sidebar-context";
import { SidebarFilterField } from "@/components/sidebar-filter-field";
import { normalizeAppTabLocation } from "@/lib/app-tab-location";
import { IssueContextMenu, type ContextMenuAction } from "@/components/issue-context-menu";
import { useNavigationContextActions } from "@/components/navigation-context-actions";

/**
 * Width of the column the primary sidebar takes when it hosts this bar
 * (MIN-546). Shared by the mobile inline layout (`md:w-80`).
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

/**
 * The navigation column of a page — list of pull requests, sessions
 * agent, sorting, returns. Written in the page (its selection state
 * drives the detail right next to it).
 *
 * Two renderings, one component:
 *
 * - **≥ 768 px**: teleported INSIDE the primary sidebar (MIN-546) — the
 * filter/actions strip into the sidebar's top band, the item list right
 * below the back row. No resizing anywhere: the primary sidebar hosts it.
 * - **< 768 px**: rendered in place, exactly as before — column of the
 * page from `md`, whole page below, `hiddenOnMobile` assigning it
 * retail. The mobile does not move.
 */
export function SecondarySidebar({
  title,
  filter,
  actions,
  hiddenOnMobile,
  itemContextActions,
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
   * Under `md`, the list and details take turns in full screen: goes here
   * the “detail is open” state of the page. No effect above `md`.
   */
  hiddenOnMobile?: boolean;
  /**
   * Row-level actions for the right-click menu, built from the row the
   * pointer landed on. Merged ABOVE the shared “open in a new tab / copy
   * link” entries, which always close the menu.
   */
  itemContextActions?: (target: Element) => ContextMenuAction[];
  children: ReactNode;
}) {
  const { headerSlot, slot, register, hosting } = useSecondarySidebar();
  const isMobileLayout = useMediaQuery("(max-width: 767px)");
  // Nothing in the server rendering: the space is reserved by the primary
  // sidebar's route-level panel anyway (routeHasSecondaryNav), and
  // teleporting before knowing where it goes would diverge the hydration.
  const [mounted, setMounted] = useState(false);
  const [navigationMenu, setNavigationMenu] = useState<{
    x: number;
    y: number;
    href: string;
    target: Element | null;
  } | null>(null);
  const navigationActions = useNavigationContextActions(navigationMenu?.href);
  const itemActions = useMemo(
    () => (navigationMenu?.target ? itemContextActions?.(navigationMenu.target) ?? [] : []),
    [navigationMenu, itemContextActions],
  );

  useIsoLayoutEffect(() => {
    setMounted(true);
    return register();
  }, [register]);

  if (!mounted) return null;

  const hoisted =
    !isMobileLayout && hosting && slot !== null && headerSlot !== null;

  /**
   * The title line COMMANDS the column, it does not name it: the filter
   * of the list, what restricts it, what can be created there.
   */
  const header = (
    <div className="secondary-sidebar-header flex h-[var(--app-content-header-height)] shrink-0 items-center gap-2 border-b border-border px-4">
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

  const body = (
    <aside
      aria-label={title}
      className="flex min-h-0 flex-1 flex-col"
      onContextMenu={(event: MouseEvent<HTMLElement>) => {
        if (event.defaultPrevented || !(event.target instanceof Element)) return;
        const target = event.target.closest<HTMLElement>(
          "a[href], [data-navigation-href]",
        );
        if (!target || !event.currentTarget.contains(target)) return;
        const href = target.dataset.navigationHref ?? target.getAttribute("href");
        const destination = normalizeAppTabLocation(href);
        if (!destination) return;
        event.preventDefault();
        setNavigationMenu({ x: event.clientX, y: event.clientY, href: destination, target });
      }}
    >
      <div className="scrollbar-quiet flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </aside>
  );

  if (hoisted) {
    return (
      <>
        {createPortal(header, headerSlot)}
        {createPortal(
          <>
            {body}
            <IssueContextMenu
              position={navigationMenu}
              onClose={() => setNavigationMenu(null)}
              actions={[...itemActions, ...navigationActions]}
              searchable={false}
            />
          </>,
          slot,
        )}
      </>
    );
  }

  // The back row's browse has docked the bar away: the sidebar shows an upper
  // level while the page keeps its place. Render NOTHING here — falling back
  // to the inline column would reflow the content the user did not leave.
  // (Mobile keeps its own inline column whatever the sidebar does.)
  if (!isMobileLayout && !hosting) return null;

  return (
    <aside
      aria-label={title}
      className={cn(
        "min-h-0 flex-col border-border",
        "w-full shrink-0 md:flex md:w-80 md:border-r",
        hiddenOnMobile ? "hidden" : "flex",
      )}
      onContextMenu={(event: MouseEvent<HTMLElement>) => {
        if (event.defaultPrevented || !(event.target instanceof Element)) return;
        const target = event.target.closest<HTMLElement>(
          "a[href], [data-navigation-href]",
        );
        if (!target || !event.currentTarget.contains(target)) return;
        const href = target.dataset.navigationHref ?? target.getAttribute("href");
        const destination = normalizeAppTabLocation(href);
        if (!destination) return;
        event.preventDefault();
        setNavigationMenu({ x: event.clientX, y: event.clientY, href: destination, target });
      }}
    >
      {header}
      <div className="scrollbar-quiet flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
      <IssueContextMenu
        position={navigationMenu}
        onClose={() => setNavigationMenu(null)}
        actions={[...itemActions, ...navigationActions]}
        searchable={false}
      />
    </aside>
  );
}
