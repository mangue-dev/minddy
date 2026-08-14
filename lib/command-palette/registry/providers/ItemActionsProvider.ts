/**
 * ItemActionsProvider - Fallback actions for every item (built in).
 *
 * - Execute the item's own `execute` callback (primary, default on Enter)
 * - Toggle favorite (secondary) when favorites are enabled
 *
 * Host providers (higher priority, or specific entity types) can add richer
 * actions on top of these.
 */

import { ArrowRightIcon, StarIcon } from "../../icons";
import type { PaletteItem } from "../../types";
import type {
  ActionProvider,
  ContextualAction,
  ActionExecutionContext,
  ActionResult,
} from "../types";

/** Favorites-group clones carry the original id under `originalId`. */
function getRealItemId(item: PaletteItem): string {
  if ("originalId" in item) {
    return (item as PaletteItem & { originalId: string }).originalId;
  }
  return item.id;
}

export const ItemActionsProvider: ActionProvider = {
  id: "item-actions",
  handles: ["*"],
  priority: 0, // Checked last — host providers win

  getActions(item: PaletteItem, ctx: ActionExecutionContext): ContextualAction[] {
    const actions: ContextualAction[] = [];

    // === PRIMARY: Execute ===
    if (item.execute) {
      actions.push({
        id: "item.execute",
        label: ctx.translate("itemActions.open"),
        icon: ArrowRightIcon,
        shortcut: ["↵"],
        category: "primary",
        execute: async (menuItem): Promise<ActionResult> => {
          const result = await menuItem.execute?.();
          // Returning false keeps the palette open
          return { success: true, closeMenu: result !== false };
        },
      });
    }

    // === SECONDARY: Toggle favorite ===
    if (ctx.toggleFavorite && item.favoritable !== false) {
      const realId = getRealItemId(item);
      const isFav = ctx.isFavorite?.(realId) ?? false;

      actions.push({
        id: "item.toggle-favorite",
        label: ctx.translate(isFav ? "itemActions.favorite.remove" : "itemActions.favorite.add"),
        icon: StarIcon,
        category: "secondary",
        execute: async (): Promise<ActionResult> => {
          ctx.toggleFavorite?.(realId);
          ctx.onFavoriteChange?.();
          return { success: true, closeMenu: false };
        },
      });
    }

    return actions;
  },
};

export default ItemActionsProvider;
