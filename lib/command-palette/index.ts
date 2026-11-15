/**
 * Command Palette — public API.
 *
 * ```tsx
 * import { CommandPalette, usePalette } from "command-palette";
 * ```
 *
 * The palette's colors come from the app's tokens through
 * components/command-palette.css, which the app imports.
 */

// === Main component & controller ===
export { CommandPalette } from "./CommandPalette";
export { usePalette } from "./hooks/usePalette";

// === Core types ===
export type { PaletteItem, CategoryDefinition } from "./types";

// === Action system ===
export type { ActionProvider, ContextualAction, ActionResult, FormSelectOption } from "./registry/types";
export { ActionRegistry } from "./registry/ActionRegistry";
export { ItemActionsProvider } from "./registry/providers/ItemActionsProvider";

// === Store (advanced: programmatic control) ===
export { usePaletteStore } from "./store";
