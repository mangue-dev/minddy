/**
 * ActionRegistry - Central registry for contextual actions.
 *
 * The registry manages ActionProviders that supply actions for different
 * entity types. When the user presses → on an item, the registry retrieves
 * all applicable actions from registered providers.
 *
 * Each <CommandPalette> builds its own instance from the `providers` prop
 * (plus the built-in calculator/execute providers) — no global singleton.
 */

import type { PaletteItem } from "../types";
import {
  sortActions,
  type ActionExecutionContext,
  type ActionProvider,
  type ActionResult,
  type ContextualAction,
} from "./types";

// =============================================================================
// ACTION REGISTRY CLASS
// =============================================================================

export class ActionRegistry {
  /** Registered providers by ID. */
  private providers: Map<string, ActionProvider> = new Map();

  /** Cache for provider lookup by entity type. */
  private typeToProviders: Map<string, ActionProvider[]> = new Map();

  // ===========================================================================
  // PROVIDER MANAGEMENT
  // ===========================================================================

  /**
   * Register an action provider.
   * Providers are checked in priority order (highest first).
   */
  register(provider: ActionProvider): void {
    this.providers.set(provider.id, provider);
    this.typeToProviders.clear();
  }

  /** Unregister a provider by ID. */
  unregister(providerId: string): void {
    if (this.providers.delete(providerId)) {
      this.typeToProviders.clear();
    }
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /** Clear all registered providers (mainly for testing). */
  clear(): void {
    this.providers.clear();
    this.typeToProviders.clear();
  }

  // ===========================================================================
  // ACTION RETRIEVAL
  // ===========================================================================

  /**
   * Get all actions available for a palette item.
   * Actions are filtered by conditions and sorted by category/priority.
   */
  getActionsForItem(
    item: PaletteItem,
    ctx: ActionExecutionContext
  ): ContextualAction[] {
    const entityType = this.getEntityType(item);
    const matchingProviders = this.getProvidersForType(entityType);

    const allActions: ContextualAction[] = [];

    for (const provider of matchingProviders) {
      try {
        const providerActions = provider.getActions(item, ctx);

        const filteredActions = providerActions.filter((action) => {
          if (!action.condition) return true;
          try {
            return action.condition(item, ctx);
          } catch (error) {
            console.error("[command-palette] action condition error", action.id, error);
            return false;
          }
        });

        allActions.push(...filteredActions);
      } catch (error) {
        console.error("[command-palette] provider getActions error", provider.id, error);
      }
    }

    return sortActions(allActions);
  }

  /**
   * Get the default action for an item (executed on Enter).
   * Checks providers' getDefaultAction first, then falls back to the first
   * primary action.
   */
  getDefaultAction(
    item: PaletteItem,
    ctx: ActionExecutionContext
  ): ContextualAction | null {
    const entityType = this.getEntityType(item);
    const matchingProviders = this.getProvidersForType(entityType);

    for (const provider of matchingProviders) {
      if (provider.getDefaultAction) {
        try {
          const defaultAction = provider.getDefaultAction(item, ctx);
          if (defaultAction) {
            if (defaultAction.condition && !defaultAction.condition(item, ctx)) {
              continue;
            }
            return defaultAction;
          }
        } catch (error) {
          console.error("[command-palette] getDefaultAction error", provider.id, error);
        }
      }
    }

    const allActions = this.getActionsForItem(item, ctx);
    const primaryAction = allActions.find((a) => a.category === "primary");

    return primaryAction ?? allActions[0] ?? null;
  }

  /**
   * Check if an item has multiple actions available.
   * Used to show/hide the actions indicator — a single action is just the
   * default one (Enter), no need for a submenu.
   */
  hasActionsForItem(item: PaletteItem, ctx: ActionExecutionContext): boolean {
    return this.getActionsForItem(item, ctx).length > 1;
  }

  /**
   * Execute the default action for an item.
   */
  async executeDefaultAction(
    item: PaletteItem,
    ctx: ActionExecutionContext
  ): Promise<ActionResult> {
    const defaultAction = this.getDefaultAction(item, ctx);

    if (!defaultAction) {
      return { success: false, message: "No action available" };
    }

    if (!defaultAction.execute) {
      if (defaultAction.requiresForm) {
        // Form actions are handled by the UI (opens the inline form)
        return { success: false, message: "Action requires form input" };
      }
      return { success: false, message: "No execute function defined" };
    }

    try {
      return await defaultAction.execute(item, ctx);
    } catch (error) {
      console.error("[command-palette] default action error", defaultAction.id, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Action failed",
      };
    }
  }

  // ===========================================================================
  // ENTITY TYPE DETECTION
  // ===========================================================================

  /**
   * Determine the entity type for a palette item.
   * Explicit entityType wins; calculator results are detected; favorites use
   * their original category; otherwise the filter category routes the item.
   */
  private getEntityType(item: PaletteItem): string {
    if (item.entityType) return item.entityType;
    if ("calculatorResult" in item) return "calculator";

    const effectiveFilterCategory =
      "originalFilterCategory" in item
        ? (item as PaletteItem & { originalFilterCategory: string }).originalFilterCategory
        : item.filterCategory;

    return effectiveFilterCategory || "default";
  }

  // ===========================================================================
  // PROVIDER LOOKUP CACHE
  // ===========================================================================

  /**
   * Get providers that handle a specific entity type (including "*" catch-all
   * providers), sorted by priority (highest first).
   */
  private getProvidersForType(entityType: string): ActionProvider[] {
    const cached = this.typeToProviders.get(entityType);
    if (cached) return cached;

    const matching = Array.from(this.providers.values())
      .filter((p) => p.handles.includes(entityType) || p.handles.includes("*"))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    this.typeToProviders.set(entityType, matching);
    return matching;
  }
}

/** Create a fresh registry (used internally by <CommandPalette>). */
export function createActionRegistry(): ActionRegistry {
  return new ActionRegistry();
}
