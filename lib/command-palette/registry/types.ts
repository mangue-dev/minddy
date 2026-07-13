/**
 * Type definitions for the Action Registry system.
 *
 * The Action Registry provides contextual actions for palette items.
 * When the user presses → (or ⌘M) on an item, the registry collects the
 * available actions from registered providers and shows them in a popover.
 *
 * Design principles:
 * - Each entity type ("task", "document", "contact"…) has its ActionProvider
 * - Actions are categorized (primary, secondary, navigation, danger)
 * - Actions can open inline forms (requiresForm) or execute immediately
 * - Conditions determine action visibility
 */

import type { PaletteItem, IconComponent } from "../types";
import type { TranslateFn } from "../i18n";

// =============================================================================
// ACTION CATEGORIES
// =============================================================================

/**
 * Action category for visual grouping in the actions popover.
 *
 * - primary: main actions (shown first)
 * - secondary: additional actions (forms, modifications)
 * - navigation: go-to/open actions
 * - danger: destructive actions (shown last, red)
 */
export type ActionCategory = "primary" | "secondary" | "navigation" | "danger";

// =============================================================================
// ACTION RESULT
// =============================================================================

/** Result returned after executing an action. */
export interface ActionResult {
  /** Whether the action succeeded. */
  success: boolean;
  /** Optional message for the host (toast…). */
  message?: string;
  /** Whether to close the palette after the action (default: true if success). */
  closeMenu?: boolean;
}

// =============================================================================
// ACTION EXECUTION CONTEXT
// =============================================================================

/**
 * Context passed to every provider and action.
 * The palette fills the base fields; the host adds its own data via `meta`
 * (<CommandPalette actionContext={{ user, router… }}>).
 */
export interface ActionExecutionContext {
  /** Current locale. */
  locale: string;
  /** Translate a key (built-in + host strings). */
  translate: TranslateFn;
  /** Close the palette. */
  closeMenu: () => void;
  /** Navigate to a path (wired by the host, e.g. router.push). */
  navigate?: (path: string) => void;
  /** Show a toast notification (wired by the host). */
  showToast?: (message: string, type: "success" | "error" | "info") => void;

  // === Favorites ===
  isFavorite?: (itemId: string) => boolean;
  /** Toggle favorite status for an item. */
  toggleFavorite?: (itemId: string) => void;
  /** Callback triggered after favorite status changes (for UI refresh). */
  onFavoriteChange?: () => void;

  /** Arbitrary host data (typed by the host app). */
  meta: Record<string, unknown>;
}

// =============================================================================
// FORM FIELD SPECIFICATION
// =============================================================================

/** Option of a select field. */
export interface FormSelectOption {
  value: string;
  label: string;
  /** Color swatch displayed before the label. */
  color?: string;
  /** Icon displayed before the label. */
  icon?: React.ReactNode;
  /** Dimmed text displayed after the label. */
  description?: string;
  disabled?: boolean;
}

/**
 * A field of an inline action form.
 *
 * Advanced behavior:
 * - `loadOptions` resolves options dynamically (sync or async) from the
 *   current form values — e.g. load the members of the selected project.
 * - `dependsOn` lists field keys this field depends on: when one of them
 *   changes, this field is cleared and its options re-resolved.
 */
export interface FormFieldSpec {
  /** Field key (used in form values). */
  key: string;
  /** Field type. "select" shows the searchable inline dropdown. */
  type: "text" | "select";
  /** Inline label / placeholder. */
  label: string;
  placeholder?: string;
  /** Required fields gate auto-submit (default: true). */
  required?: boolean;
  /** Static options for select fields. */
  options?: FormSelectOption[];
  /** Dynamic options resolver (sync or async). */
  loadOptions?: (
    values: Record<string, unknown>,
    ctx: ActionExecutionContext
  ) => FormSelectOption[] | Promise<FormSelectOption[]>;
  /** Field keys whose change clears this field and re-runs loadOptions. */
  dependsOn?: string[];
}

// =============================================================================
// CONTEXTUAL ACTION
// =============================================================================

/**
 * A contextual action available for a palette item.
 * Displayed in the actions popover (→ / ⌘M).
 */
export interface ContextualAction {
  /** Unique action identifier (e.g. "task.toggle", "doc.share"). */
  id: string;

  /** Display label. */
  label: string;

  /** Icon component. */
  icon?: IconComponent;

  /** Keyboard shortcut hint (e.g. ["⌘", "↵"]). */
  shortcut?: string[];

  /** Category for grouping and styling. */
  category: ActionCategory;

  /**
   * Execute the action.
   * Optional when requiresForm is defined (onSubmit handles execution).
   */
  execute?: (
    item: PaletteItem,
    ctx: ActionExecutionContext
  ) => Promise<ActionResult>;

  /** Condition to show this action. Hidden when it returns false. */
  condition?: (item: PaletteItem, ctx: ActionExecutionContext) => boolean;

  /**
   * If defined, selecting the action opens an inline form instead of
   * executing immediately. onSubmit is called with the collected values.
   */
  requiresForm?: {
    fields: FormFieldSpec[];
    /** Pre-filled values for form fields. */
    prefilledValues?: Record<string, unknown>;
    onSubmit: (
      values: Record<string, unknown>,
      item: PaletteItem,
      ctx: ActionExecutionContext
    ) => Promise<ActionResult>;
  };

  /** Priority within category (higher = shown first). Default 0. */
  priority?: number;
}

// =============================================================================
// ACTION PROVIDER
// =============================================================================

/**
 * Provider that supplies actions for specific entity types.
 *
 * Entity resolution for an item:
 *   item.entityType ?? ("calculatorResult" in item → "calculator")
 *                   ?? item.filterCategory
 *
 * A provider handling "*" matches every entity type (used for fallbacks
 * like the built-in execute/favorite provider).
 */
export interface ActionProvider {
  /** Unique provider identifier. */
  id: string;

  /** Entity types this provider handles ("*" = all). */
  handles: string[];

  /** Provider priority (higher = checked first). */
  priority?: number;

  /** Get available actions for an item. */
  getActions: (
    item: PaletteItem,
    ctx: ActionExecutionContext
  ) => ContextualAction[];

  /**
   * Get the default action for Enter.
   * If not defined, the first primary action is used.
   */
  getDefaultAction?: (
    item: PaletteItem,
    ctx: ActionExecutionContext
  ) => ContextualAction | null;
}

// =============================================================================
// TYPE GUARDS & SORTING
// =============================================================================

/** Check if an action has a form requirement. */
export function actionRequiresForm(
  action: ContextualAction
): action is ContextualAction & {
  requiresForm: NonNullable<ContextualAction["requiresForm"]>;
} {
  return action.requiresForm !== undefined;
}

/** Order of action categories for sorting. */
export const ACTION_CATEGORY_ORDER: ActionCategory[] = [
  "primary",
  "secondary",
  "navigation",
  "danger",
];

/** Sort actions by category order then by priority. */
export function sortActions(actions: ContextualAction[]): ContextualAction[] {
  return [...actions].sort((a, b) => {
    const categoryDiff =
      ACTION_CATEGORY_ORDER.indexOf(a.category) -
      ACTION_CATEGORY_ORDER.indexOf(b.category);

    if (categoryDiff !== 0) return categoryDiff;

    return (b.priority ?? 0) - (a.priority ?? 0);
  });
}
