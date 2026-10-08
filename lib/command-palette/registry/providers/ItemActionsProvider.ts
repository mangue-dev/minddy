/**
 * ItemActionsProvider - Fallback actions for every item (built in).
 *
 * - Execute the item's own `execute` callback (primary, default on Enter)
 *
 * Host providers (higher priority, or specific entity types) can add richer
 * actions on top of these.
 */

import { ArrowRightIcon } from "../../icons";
import type { PaletteItem } from "../../types";
import type {
  ActionProvider,
  ContextualAction,
  ActionExecutionContext,
  ActionResult,
} from "../types";

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
        // Enter already runs it: not a reason for a submenu
        basic: true,
        execute: async (menuItem): Promise<ActionResult> => {
          const result = await menuItem.execute?.();
          // Returning false keeps the palette open
          return { success: true, closeMenu: result !== false };
        },
      });
    }

    return actions;
  },
};

export default ItemActionsProvider;
