/**
 * PaletteConfig — the internal context threading configuration through
 * every sub-component (translate fn, categories, action registry…).
 *
 * The context is created by <CommandPalette> itself from its props;
 * hosts never mount it manually.
 */

"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ActionRegistry } from "./registry/ActionRegistry";
import type { TranslateFn } from "./i18n";
import type { CategoryDefinition } from "./types";

// =============================================================================
// TYPES
// =============================================================================

export interface PaletteShortcuts {
  /**
   * Key (with cmd/ctrl held) opening the actions popover on the highlighted
   * item. Default: "m" → ⌘M / Ctrl+M. ArrowRight always works too.
   */
  actionsKey: string;
}

export interface ResolvedPaletteConfig {
  /** Translate function (built-in strings + host overrides). */
  t: TranslateFn;
  /** BCP-47-ish locale ("en", "fr", "fr-FR"…). */
  locale: string;
  /** Ordered category tabs (excluding the built-in "all"). */
  categories: CategoryDefinition[];
  /** Grouping order by category id (favorites first, then declaration order). */
  categoryOrder: Record<string, number>;
  /** Action registry for this palette instance. */
  registry: ActionRegistry;
  /** Keyboard shortcuts. */
  shortcuts: PaletteShortcuts;
  /** Footer logo (left slot). */
  footerLogo?: ReactNode;
}

// =============================================================================
// CONTEXT
// =============================================================================

const PaletteConfigContext = createContext<ResolvedPaletteConfig | null>(null);

export function PaletteConfigProvider({
  value,
  children,
}: {
  value: ResolvedPaletteConfig;
  children: ReactNode;
}) {
  return (
    <PaletteConfigContext.Provider value={value}>
      {children}
    </PaletteConfigContext.Provider>
  );
}

export function usePaletteConfig(): ResolvedPaletteConfig {
  const ctx = useContext(PaletteConfigContext);
  if (!ctx) {
    throw new Error(
      "Palette components must be rendered inside <CommandPalette>."
    );
  }
  return ctx;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Compute the grouping order map: favorites first, then categories in
 * declaration order.
 */
export function buildCategoryOrder(
  categories: CategoryDefinition[]
): Record<string, number> {
  const order: Record<string, number> = { favorites: 0 };
  categories.forEach((cat, i) => {
    if (cat.id !== "all") order[cat.id] = i + 1;
  });
  return order;
}
