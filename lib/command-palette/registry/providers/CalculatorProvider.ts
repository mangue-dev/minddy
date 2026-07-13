/**
 * CalculatorProvider - Actions for calculator results (built in).
 *
 * - Copy result (primary, default on Enter)
 * - Copy "expression = result" (secondary)
 * - Copy expression (secondary)
 */

import { CopyIcon } from "../../icons";
import type { PaletteItem } from "../../types";
import type {
  ActionProvider,
  ContextualAction,
  ActionExecutionContext,
  ActionResult,
} from "../types";

// =============================================================================
// HELPER
// =============================================================================

export interface CalculatorPaletteItem extends PaletteItem {
  calculatorResult?: {
    expression: string;
    result: string | number;
    type: "math" | "date" | "conversion" | "percentage";
  };
}

function isCalculatorItem(item: PaletteItem): item is CalculatorPaletteItem {
  return "calculatorResult" in item;
}

async function copyToClipboard(
  text: string,
  ctx: ActionExecutionContext
): Promise<ActionResult> {
  try {
    await navigator.clipboard.writeText(text);
    ctx.showToast?.(ctx.translate("calculator.copied"), "success");
    return { success: true, closeMenu: true, message: ctx.translate("calculator.copied") };
  } catch {
    ctx.showToast?.(ctx.translate("calculator.copyFailed"), "error");
    return { success: false, closeMenu: false, message: ctx.translate("calculator.copyFailed") };
  }
}

// =============================================================================
// PROVIDER
// =============================================================================

export const CalculatorProvider: ActionProvider = {
  id: "calculator",
  handles: ["calculator"],
  priority: 100,

  getActions(item: PaletteItem, ctx: ActionExecutionContext): ContextualAction[] {
    if (!isCalculatorItem(item) || !item.calculatorResult) return [];

    const { expression, result } = item.calculatorResult;

    return [
      {
        id: "calculator.copy-result",
        label: ctx.translate("calculator.copy"),
        icon: CopyIcon,
        shortcut: ["↵"],
        category: "primary",
        execute: (_item, execCtx) => copyToClipboard(String(result), execCtx),
      },
      {
        id: "calculator.copy-full",
        label: ctx.translate("calculator.copyFull"),
        icon: CopyIcon,
        category: "secondary",
        execute: (_item, execCtx) =>
          copyToClipboard(`${expression} = ${result}`, execCtx),
      },
      {
        id: "calculator.copy-expression",
        label: ctx.translate("calculator.copyExpression"),
        icon: CopyIcon,
        category: "secondary",
        execute: (_item, execCtx) => copyToClipboard(expression, execCtx),
      },
    ];
  },

  getDefaultAction(item, ctx) {
    const actions = this.getActions(item, ctx);
    return actions.find((a) => a.id === "calculator.copy-result") ?? null;
  },
};

export default CalculatorProvider;
