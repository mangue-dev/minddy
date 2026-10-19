import type * as React from "react";

export type IconType = React.ComponentType<{ className?: string }>;

export interface NavItem {
  /** Stable identifier, also used to match the active item. */
  key: string;
  label: string;
  icon?: IconType;
  /** Render as a link when set; otherwise a button using `onClick`. */
  href?: string;
  onClick?: () => void;
  /** Optional trailing content (a count, dot, chip, etc.). */
  badge?: React.ReactNode;
  disabled?: boolean;
  /** Force active state; otherwise derived from `activeKey`. */
  active?: boolean;
  /** Label shown in a tooltip when the sidebar is collapsed. */
  tooltip?: string;
  /**
   * Second key of the chord that jumps here (e.g. "M" for "G then M"). It shows
   * in the row's tooltip, and — while the app reports the chord as armed
   * (`Sidebar`'s `chordArmed`) — as a trailing `Kbd` on the row itself.
   */
  shortcut?: string;
  /**
   * Replays `badge` in a corner of the icon while the sidebar is COLLAPSED
   * (normal badges are not rendered there, for lack of room). For compact
   * indicators only — a running spinner, an unread dot — not for counters.
   */
  showBadgeCollapsed?: boolean;
  /**
   * What the corner pip carries instead of `badge`, when that one would not
   * fit. Real case: a "Home" entry that stacks an alert triangle and a counter;
   * collapsed, only the triangle can go.
   */
  badgeCollapsed?: React.ReactNode;
}

export interface NavSection {
  key?: string;
  /** Optional heading (hidden when the sidebar is collapsed). */
  label?: string;
  items: NavItem[];
}
