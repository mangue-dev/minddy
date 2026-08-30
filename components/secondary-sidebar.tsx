"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { cn, useMediaQuery } from "mangue-ui";
import { useSecondarySidebar } from "@/lib/secondary-sidebar-context";
import { SidebarFilterField } from "@/components/sidebar-filter-field";
import { transitions } from "@/lib/motion";

/** Width of the column (`w-80`), shared by the shutter, its gutter, and the
 * Zen mode navigation block, which adds it to that of the primary. */
export const SECONDARY_WIDTH = 320;

/**
 * Registration must be done BEFORE painting: it is he who decides whether the
 * Primary sidebar is rail. Passed by an ordinary effect, we would see the
 * primary unfolded for the duration of an image each time you navigate to a page
 * barre secondaire.
 */
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The navigation column of a page — list of pull requests, sessions
 * agent, sorting, returns. Written in the page (its selection state
 * driver detail right next to it), displayed in the application chassis.
 *
 * Two renderings, one component:
 *
 * - **≥ 768 px**: teleported into the chassis, full height, to the left of the
 * header. Its title line is the height of the header and bears the same
 * bottom border — a single horizontal line crosses the screen.
 * - **< 768 px**: rendered in place, exactly as before — column of the
 * page from `md`, whole page below, `hiddenOnMobile` assigning it
 * retail. The mobile does not move.
 */
export function SecondarySidebar({
  title,
  filter,
  actions,
  hiddenOnMobile,
  children,
}: {
  /**
   * The name of the column. It is no longer WRITTEN on the title line — the thread
   * d'Ariane already has it, on the same horizontal strip and 340 px away —
   * but there remains the accessible label of the pane, and the fallback when the page
   * does not offer a filter. Omitted by the road SKELETONS, who occupy the
   * place of the bar by the time the screen arrives: without them the primary is
   * would unfold and the gutter would close with each navigation, for all
   * reopen half a second later.
   */
  title?: string;
  /**
   * The text filter of the list, which occupies the title line.
   *
   * Passed in data rather than `ReactNode`: the five bar screens
   * secondary must offer the same gesture, in the same place, with the same
   * appearance — a `ReactNode` would let everyone reinvent their version.
   *
   * There is NO counter next to it: the number of elements is in the
   * placeholder (“Filter the 12 pull requests…”). A number placed alone between
   * the field and the actions did not say what it counted on, and flew to a
   * field already cramped the 20 px which make the difference.
   */
  filter?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    clearLabel: string;
  };
  /** Actions from the title line (filters, creation button, etc.), pushed to the right. */
  actions?: ReactNode;
  /**
   * Under `md`, the list and details take turns in full screen: go here
   * the “detail is open” state of the page. No effect above `md`.
   */
  hiddenOnMobile?: boolean;
  children: ReactNode;
}) {
  const { slot, register } = useSecondarySidebar();
  const isMobileLayout = useMediaQuery("(max-width: 767px)");
  // Nothing in the server rendering: the space to be taken in the chassis is reserved there
  // by road (routeHasSecondaryNav), and make the bar here before knowing
  // where it goes would diverge the hydration.
  const [mounted, setMounted] = useState(false);

  useIsoLayoutEffect(() => {
    setMounted(true);
    return register();
  }, [register]);

  if (!mounted) return null;

  const hoisted = !isMobileLayout && slot !== null;

  const aside = (
    <aside
      aria-label={title}
      className={cn(
        "min-h-0 flex-col",
        hoisted
          ? "flex h-full w-full border-r border-sidebar-border bg-sidebar"
          : cn(
              "w-full shrink-0 border-border md:flex md:w-80 md:border-r",
              hiddenOnMobile ? "hidden" : "flex",
            ),
      )}
    >
      {/* The title line COMMANDS the column, it does not name it: the filter
          of the list, what restricts it, what can be created there. It's the only one
          pinned strip of the pane — everything that drives the list should be here, and
          not in `children`, which scrolls with it. */}
      <div className="secondary-sidebar-header flex h-[60px] shrink-0 items-center gap-2 border-b border-border px-4">
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
      <div className="scrollbar-quiet flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </aside>
  );

  return hoisted ? createPortal(aside, slot) : aside;
}

/**
 * The docking point, placed by the chassis between the primary sidebar and the
 * column header + content.
 *
 * In Zen mode (MIN-134) it is rendered identically, but IN the block of
 * superimposed navigation (`ZenNavOverlay`) rather than in the flow: the
 * gutter opens and closes the same column, at the same width, depending on whether the
 * page carries a secondary bar or not.
 */
export function SecondarySidebarSlot({ reserve }: { reserve: boolean }) {
  const reduce = useReducedMotion();
  return <SecondarySidebarGutter reserve={reserve} reduce={Boolean(reduce)} />;
}

/**
 * The gutter: ordinary mode. Empty, it takes up no space; `reserve`
 * gives it its width before the page has increased its bar (first
 * display), so that the content does not start at full width and then do not
 * retracts.
 *
 * It is she who carries half of the shift between the two modes of
 * PRIMARY: it opens and closes (0 ↔ 320) on the SAME curve as the
 * width of it (`transitions.shell`), and the header, the breadcrumbs and the
 * contents follow in a block. The interior flap maintains its width throughout the
 * path — it is the gutter which uncovers or covers it, it is not compressed
 * jamais.
 *
 * It is painted IN THE COLORS OF THE BAR, and not left transparent: in
 * leaving a page with a secondary sidebar, the page is suddenly unmounted and it
 * gutter is empty during the 180 ms of its closure. Without a bottom, we
 * saw the `bg-background` of the chassis — a light strip open between the bar
 * primary and the header, both in `bg-sidebar`. With it, the column closes
 * like a panel, without a gap.
 */
function SecondarySidebarGutter({
  reserve,
  reduce,
}: {
  reserve: boolean;
  reduce: boolean;
}) {
  const { setSlot } = useSecondarySidebar();
  return (
    <motion.div
      className="relative z-[31] h-full shrink-0 overflow-hidden bg-sidebar"
      // `initial` explicit: this is the value that framer writes in the
      // HTML from the server, and it is she who reserves the column for the first
      // affichage (cf. routeHasSecondaryNav).
      initial={{ width: reserve ? SECONDARY_WIDTH : 0 }}
      animate={{ width: reserve ? SECONDARY_WIDTH : 0 }}
      transition={reduce ? { duration: 0 } : transitions.shell}
    >
      {/* The line that runs under the header and under the title line of the
          bar, replayed here for the same reason: emptied, the gutter would have it
          interrupted over its entire width until it closes.
          He goes BEHIND the shutter (`relative` on this one, which paints him
          above), and especially not above: `--border` is worth 8% of white in
          dark theme, two superimposed lines make one of 15% — a line
          clearer on the exact width of the bar, in the middle of a line
          which crosses the entire screen. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[60px] border-b border-border"
      />
      <div
        ref={setSlot}
        className="relative h-full"
        style={{ width: SECONDARY_WIDTH }}
      />
    </motion.div>
  );
}
