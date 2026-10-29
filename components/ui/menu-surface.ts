/**
 * The floating-menu look shared by `DropdownMenuContent` and the menus that
 * are not Radix menus (mention lists, the "/" and "$" menus): one surface, one
 * padding, one row shape and one highlight, so they read as one component.
 */

/** The room every floating surface (popover, dropdown, select, tooltip)
    keeps from the edges of the screen when it would otherwise touch them. */
export const OVERLAY_COLLISION_PADDING = 10;

/** Surface: radius, padding, elevation and edge. */
export const MENU_SURFACE_CLASS = "rounded-xl bg-popover p-2 shadow-md ring-1 ring-foreground/10";

/** A scrolling menu: a row the keyboard brings into view stops 40px from the
    edge, clear of the 32px fade and its chevron (menu-scroll-fade.tsx). The
    dropdown and command list primitives keep the same `scroll-py-10`. */
export const MENU_SCROLL_CLASS = "overflow-y-auto overscroll-contain scroll-py-10";

/** A row, as a dropdown item. */
export const MENU_ROW_CLASS = "flex min-h-8 w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm";

/** The highlighted row. */
export const MENU_ROW_ACTIVE_CLASS = "bg-accent text-accent-foreground";
