/** Shared geometry and hover treatment for compact primary-sidebar controls. */
export const SIDEBAR_COMPACT_CONTROL_CLASS =
  "relative flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg px-[11px] text-muted-foreground transition-colors hover:!bg-sidebar-accent hover:text-foreground";

/**
 * Actions of the sidebar's command band (filter, create): the same 36 px
 * square and 16 px icon as the top bar's search and inbox buttons right above
 * them, so the two rows line up.
 */
export const SIDEBAR_HEADER_ACTION_CLASS =
  "relative flex size-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-0 text-sidebar-foreground/65 transition-colors hover:!bg-sidebar-accent hover:text-sidebar-foreground";

/** Shared height and hover treatment for primary-sidebar navigation actions. */
export const SIDEBAR_ROW_ACTION_CLASS =
  "h-9 rounded-lg hover:!bg-sidebar-accent hover:text-sidebar-foreground";

/** Hover delay shared by primary-sidebar tooltips. */
export const SIDEBAR_TOOLTIP_DELAY_MS = 600;
