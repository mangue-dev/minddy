/**
 * Core type definitions for the command palette.
 */

import type { ComponentType, ReactNode, SVGProps } from "react";

/** SVG icon component type (any component rendering an svg works) */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// =============================================================================
// PALETTE ITEM
// =============================================================================

/**
 * A searchable/selectable entry of the palette.
 *
 * Items are plain data: the host app builds the list (commands, documents,
 * contacts, navigation targets…) and hands it to <CommandPalette items={…}>.
 */
export interface PaletteItem {
  /** Unique id. Also used for favorites & usage tracking. */
  id: string;
  /** Main label. */
  title: string;
  /** Secondary text, searchable (not displayed in the compact rows). */
  description?: string;
  /** Icon displayed at the left of the row. */
  icon?: ReactNode;
  /** Keyboard shortcut hint displayed at the right (e.g. ["⌘", "P"]). */
  shortcut?: string[];
  /** Extra search terms. */
  keywords?: string[];
  /**
   * Direct action executed on Enter when no ActionProvider overrides it.
   * Return false to keep the palette open.
   */
  execute?: () => void | false | Promise<void | false>;
  /**
   * Category id used for filter tabs and result grouping.
   * Must match a CategoryDefinition id (or "all").
   */
  filterCategory: string;
  /**
   * Entity type used to route the item to ActionProviders.
   * Falls back to filterCategory when omitted.
   */
  entityType?: string;
  /** Dimmed context text displayed next to the title (e.g. "Project › Module"). */
  contextLabel?: string;
  /** Small type label displayed at the right of the row (e.g. "Task"). */
  typeLabel?: string;
  /** Colored status dot displayed before the title. */
  statusDot?: "success" | "muted" | "warning" | "danger";
  /** Optional context id — items matching SearchContext.currentContextId get boosted. */
  contextId?: string;
  /** Optional sub-context id — items matching SearchContext.currentSubContextId get boosted. */
  subContextId?: string;
  /** Arbitrary host data, available to ActionProviders. */
  data?: unknown;
}

/** Internal: favorites are cloned into a "favorites" group with these extras. */
export interface FavoritePaletteItem extends PaletteItem {
  originalId: string;
  originalFilterCategory: string;
}

// =============================================================================
// CATEGORIES
// =============================================================================

/**
 * A filter tab / result group of the palette.
 * The "all" and "favorites" categories are built in.
 */
export interface CategoryDefinition {
  /** Category id, referenced by PaletteItem.filterCategory. */
  id: string;
  /** Tab + group header label. */
  label: string;
  /** Tab icon. */
  icon?: IconComponent;
  /**
   * Base score bonus applied to items of this category when searching.
   * Lets you keep e.g. commands above raw data in mixed results.
   */
  searchBoost?: number;
  /** Search input placeholder when this tab is active. */
  placeholder?: string;
}

/** Options to open the palette pre-filtered on a category. */
export interface PaletteFilterOptions {
  category: string;
}

// =============================================================================
// VIEW EXTENSION
// =============================================================================

/** API handed to custom views (e.g. an AI chat view). */
export interface PaletteViewApi {
  /** Query captured when the view was entered (e.g. via Tab). */
  initialQuery: string;
  /** Return to the search view. */
  backToSearch: () => void;
  /** Close the palette entirely. */
  closePalette: () => void;
}

/** A pluggable custom view. */
export type PaletteViewRenderer = (api: PaletteViewApi) => ReactNode;
