/**
 * Command Palette — public API.
 *
 * ```tsx
 * import { CommandPalette, usePalette } from "command-palette";
 * import "command-palette/src/styles/theme.css";
 * ```
 */

// === Main component & controller ===
export { CommandPalette, type CommandPaletteProps } from "./CommandPalette";
export { usePalette, isApplePlatform, type PaletteController, type UsePaletteOptions } from "./hooks/usePalette";

// === Core types ===
export type {
  PaletteItem,
  CategoryDefinition,
  PaletteFilterOptions,
  PaletteViewApi,
  PaletteViewRenderer,
  IconComponent,
} from "./types";

// === Action system ===
export type {
  ActionProvider,
  ContextualAction,
  ActionExecutionContext,
  ActionResult,
  ActionCategory,
  FormFieldSpec,
  FormSelectOption,
} from "./registry/types";
export { sortActions, actionRequiresForm } from "./registry/types";
export { ActionRegistry, createActionRegistry } from "./registry/ActionRegistry";
export { CalculatorProvider } from "./registry/providers/CalculatorProvider";
export { ItemActionsProvider } from "./registry/providers/ItemActionsProvider";

// === Search engine (usable standalone) ===
export {
  matchesSearch,
  matchesSearchFields,
  calculateSearchScore,
  searchWithRelevance,
  normalizeSearchText,
  buildKeywords,
  SearchEngine,
  configureSearchStorage,
  loadFavorites,
  toggleFavorite,
  isFavorite,
  recordUsage,
  loadUsageStats,
  type SearchableItem,
  type SearchContext,
  type ScoredSearchResult,
  type UsageStats,
} from "./search/engine";

// === Calculator (usable standalone) ===
export {
  parseExpression,
  mightBeCalculation,
  loadCalculatorLocale,
  getDefaultLocale,
  CALCULATOR_LOCALE_EN,
  CALCULATOR_LOCALE_FR,
} from "./calculator";
export type {
  CalculationResult,
  CalculationType,
  CalculatorLocaleConfig,
} from "./calculator";

// === i18n ===
export { STRINGS_EN, STRINGS_FR, createTranslate, type PaletteStrings, type TranslateFn } from "./i18n";

// === Store (advanced: programmatic control) ===
export { usePaletteStore, type PaletteView, type PaletteStore } from "./store";
