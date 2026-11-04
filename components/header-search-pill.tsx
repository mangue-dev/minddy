"use client";

import { type ReactNode } from "react";
import { type AppIcon } from "@/components/icon";

/**
 * A single command-palette row. Superset of a plain command-menu item: adds
 * a `meta` slot rendered right-aligned (e.g. an issue identifier badge or a
 * project chip), mirroring how AutoKap tags each result with its project. This
 * is the shared "command list" contract consumed by both the mobile nav search
 * (mobile navigation) and the desktop command palette (command-palette.tsx).
 */
export interface PaletteItem {
  key: string;
  label: string;
  icon?: AppIcon;
  /** Extra terms to match against when searching (identifier, project name…). */
  keywords?: string[];
  /**
   * Keyboard shortcut shown right-aligned on the desktop row (e.g. ["G", "H"]
   * for the G→H chord, ["?"] for the cheat sheet). Each entry renders as a Kbd
   * chip; the mobile search ignores this field. Named `keys` (not `shortcut`)
   * because a plain command-menu item already reserves `shortcut?: string`.
   */
  keys?: string[];
  /** Secondary text, SOUGHT-AFTER but less strong than a title — an extract from a
   * page found by its contents (MIN-276). The engine ranks a title match
   * above ; this is what puts “found by its title” in front of
   * “cited in a body” without explicit sorting. */
  description?: string;
  /** Right-aligned trailing content — identifier badge or project chip. */
  meta?: ReactNode;
  /** Plain-text version of `meta` (identifier, project name) — the desktop
   *  command palette renders it as a dim context label next to the title. */
  metaText?: string;
  /**
   * Optional icon rendered LEFT of the right-aligned context text on the
   * desktop palette (e.g. the project orb). Ignored by the mobile search.
   */
  contextIcon?: ReactNode;
  /** Desktop palette only: the row answers a query but stays out of the list
   *  shown before typing (routines, pull requests, notifications, MIN-846). */
  searchOnly?: boolean;
  /** Entity type for the palette's contextual-action routing (e.g. "issue"). */
  entityType?: string;
  /** Project this row belongs to. The desktop palette boosts rows whose
   *  `contextId` matches the project the user is currently in, so "search
   *  everywhere" (MIN-91) still ranks the project at hand first. Also what the
   *  mobile cap keys on. Ignored by the mobile search. */
  contextId?: string;
  /** Raw entity (e.g. the Issue) — lets the palette derive status icons and wire
   *  mutations (⌘; actions) without re-querying. Ignored by the mobile search. */
  data?: unknown;
  /** Stable in-app destination for link-oriented palette actions. The mobile
   *  menu still uses `onSelect`; desktop uses this for copy/open-in-new-tab. */
  href?: string;
  onSelect?: () => void;
  /** A creation that has no address before it runs (a new page): how the
   *  new-tab palette (⌘T) performs it, opening the result in a new tab. */
  onSelectInNewTab?: () => void;
}

export interface PaletteGroup {
  key?: string;
  heading?: string;
  items: PaletteItem[];
}
